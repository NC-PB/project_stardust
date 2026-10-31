//! Images dropped or pasted into the editor (`S-images`): copied or written into the image root, never over an
//! existing file (`R-no-destroy`), and linked relative to the open file.

use std::fs::{File, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::files::{MAX_IMAGE_BYTES, image_mime};

/// Names tried with a suffix before a copy gives up.
const MAX_SUFFIX: u32 = 9999;

/// An image ready to be linked from the open file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ImportedImage {
    /// The markdown to insert, `![alt](relative/link.png)`.
    pub markdown: String,
    /// The image relative to the repository root, with `/` separators.
    pub path: String,
    /// False when the dropped file already was inside the image root and was linked as is.
    pub copied: bool,
}

/// Copies the image at `source` into `images_root` (relative to `repo_root`) and returns the
/// markdown linking it from the markdown file `file`. A name that is taken gets a suffix
/// (`shot-1.png`); no file is ever overwritten. An image already inside the image root is
/// linked without copying.
pub fn import_image(
    repo_root: &Path,
    images_root: &str,
    file: &Path,
    source: &Path,
) -> Result<ImportedImage, String> {
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| source.display().to_string());
    let source = source
        .canonicalize()
        .map_err(|_| format!("`{name}` not found"))?;
    if !source.is_file() {
        return Err(format!("`{name}` is not a file"));
    }
    image_mime(&source).ok_or_else(|| format!("`{name}` is not an image"))?;
    let size = source.metadata().map_err(|err| err.to_string())?.len();
    if size > MAX_IMAGE_BYTES {
        return Err(format!("`{name}` is larger than 20 MB"));
    }

    let (root, folder, images) = image_folders(repo_root, images_root, file)?;
    let (target, copied) = if source.starts_with(&images) {
        (source, false)
    } else {
        let target = write_new(&images, &name, |copy| {
            File::open(&source).and_then(|mut from| std::io::copy(&mut from, copy).map(|_| ()))
        })?;
        (target, true)
    };
    Ok(imported(&root, &folder, &target, copied))
}

/// Writes the image `bytes` pasted from the clipboard, of type `mime`, into `images_root` as
/// `pasted-<stamp>.<ext>` (with a suffix when taken) and returns the markdown linking it from
/// the markdown file `file`.
pub fn paste_image(
    repo_root: &Path,
    images_root: &str,
    file: &Path,
    mime: &str,
    bytes: &[u8],
    stamp: &str,
) -> Result<ImportedImage, String> {
    let extension =
        image_extension(mime).ok_or_else(|| format!("the pasted `{mime}` is not an image"))?;
    let name = format!("pasted-{stamp}.{extension}");
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(format!("`{name}` is larger than 20 MB"));
    }
    let (root, folder, images) = image_folders(repo_root, images_root, file)?;
    let target = write_new(&images, &name, |out| out.write_all(bytes))?;
    Ok(imported(&root, &folder, &target, true))
}

/// The file extension for an image MIME type, the reverse of `image_mime`.
fn image_extension(mime: &str) -> Option<&'static str> {
    Some(match mime.to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/avif" => "avif",
        "image/bmp" => "bmp",
        _ => return None,
    })
}

/// The canonical repository root, the folder of the markdown file `file` and the image root,
/// created when missing; both folders must be inside the repository.
fn image_folders(
    repo_root: &Path,
    images_root: &str,
    file: &Path,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let root = repo_root.canonicalize().map_err(|err| err.to_string())?;
    let folder = file
        .parent()
        .and_then(|folder| folder.canonicalize().ok())
        .filter(|folder| folder.starts_with(&root))
        .ok_or_else(|| format!("{} is not inside the repository", file.display()))?;
    let images = root.join(images_root);
    std::fs::create_dir_all(&images)
        .map_err(|err| format!("cannot create the image root `{images_root}`: {err}"))?;
    let images = images.canonicalize().map_err(|err| err.to_string())?;
    if !images.starts_with(&root) {
        return Err(format!(
            "the image root `{images_root}` is outside the repository"
        ));
    }
    Ok((root, folder, images))
}

/// The markdown linking `target` from `folder`, with the file stem as alt text.
fn imported(root: &Path, folder: &Path, target: &Path, copied: bool) -> ImportedImage {
    let alt = target
        .file_stem()
        .map(|stem| stem.to_string_lossy().replace(['[', ']', '\\'], ""))
        .unwrap_or_default();
    ImportedImage {
        markdown: format!("![{alt}]({})", relative_link(folder, target)),
        path: target
            .strip_prefix(root)
            .unwrap_or(target)
            .components()
            .map(|part| part.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
        copied,
    }
}

/// Writes a new file into `folder` under `name`, or the first free `stem-N.ext`, with
/// `write`. Each name is claimed with `create_new`, so a file that appears meanwhile is not
/// overwritten either.
fn write_new(
    folder: &Path,
    name: &str,
    mut write: impl FnMut(&mut File) -> std::io::Result<()>,
) -> Result<PathBuf, String> {
    let file_name = Path::new(name);
    let stem = file_name
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = file_name
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();
    for n in 0..=MAX_SUFFIX {
        let candidate = match n {
            0 => folder.join(name),
            n => folder.join(format!("{stem}-{n}{extension}")),
        };
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut copy) => {
                if let Err(err) = write(&mut copy) {
                    // Only the file just created here, never one that existed before.
                    drop(copy);
                    let _ = std::fs::remove_file(&candidate);
                    return Err(format!("could not copy `{name}`: {err}"));
                }
                return Ok(candidate);
            }
            Err(err) if err.kind() == ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("could not copy `{name}`: {err}")),
        }
    }
    Err(format!("no free name for `{name}` in the image root"))
}

/// The link from the folder `from` to the file `to`, both absolute: `..` up to their common
/// folder, then down, with `/` separators and characters markdown links cannot hold as is
/// percent encoded.
pub(crate) fn relative_link(from: &Path, to: &Path) -> String {
    let from: Vec<Component> = from.components().collect();
    let to: Vec<Component> = to.components().collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let up = from[common..].iter().map(|_| "..".to_string());
    let down = to[common..]
        .iter()
        .map(|part| encode_segment(&part.as_os_str().to_string_lossy()));
    up.chain(down).collect::<Vec<_>>().join("/")
}

/// Encodes what would end or confuse a markdown link destination, or what `image_data_url`
/// cuts off (`#`, `?`); `percent_decode` reverses it.
fn encode_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for c in segment.chars() {
        match c {
            ' ' | '%' | '(' | ')' | '<' | '>' | '#' | '?' => {
                out.push_str(&format!("%{:02X}", c as u32))
            }
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::files::{ImageRead, image_data_url, percent_decode};

    fn temp_repo(name: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("stardust-images-{name}-{}", fastrand::u32(..)))
            .join("repo");
        std::fs::create_dir_all(dir.join("docs/planning/next")).unwrap();
        dir
    }

    fn cleanup(repo: &Path) {
        std::fs::remove_dir_all(repo.parent().unwrap()).unwrap();
    }

    #[test]
    fn copies_into_the_image_root_and_links_from_the_file() {
        let repo = temp_repo("copy");
        let file = repo.join("docs/planning/next/a.md");
        std::fs::write(&file, "x").unwrap();
        let source = repo.parent().unwrap().join("my shot.png");
        std::fs::write(&source, b"png").unwrap();

        let image = import_image(&repo, "docs/images", &file, &source).unwrap();
        assert_eq!(
            image,
            ImportedImage {
                markdown: "![my shot](../../images/my%20shot.png)".to_string(),
                path: "docs/images/my shot.png".to_string(),
                copied: true,
            }
        );
        assert_eq!(
            std::fs::read(repo.join("docs/images/my shot.png")).unwrap(),
            b"png"
        );
        assert!(source.exists(), "the dropped file stays where it was");
        // Read mode finds the copy through the inserted link.
        let link = "../../images/my%20shot.png";
        assert!(matches!(
            image_data_url(&repo, &file, link),
            Ok(ImageRead::Shown { .. })
        ));
        cleanup(&repo);
    }

    #[test]
    fn a_name_clash_gets_a_suffix_and_nothing_is_overwritten() {
        let repo = temp_repo("clash");
        let file = repo.join("docs/planning/next/a.md");
        std::fs::create_dir_all(repo.join("docs/images")).unwrap();
        std::fs::write(repo.join("docs/images/shot.png"), b"old").unwrap();
        std::fs::write(repo.join("docs/images/shot-1.png"), b"old 1").unwrap();
        let source = repo.parent().unwrap().join("shot.png");
        std::fs::write(&source, b"new").unwrap();

        let image = import_image(&repo, "docs/images", &file, &source).unwrap();
        assert_eq!(image.markdown, "![shot-2](../../images/shot-2.png)");
        assert_eq!(
            std::fs::read(repo.join("docs/images/shot.png")).unwrap(),
            b"old"
        );
        assert_eq!(
            std::fs::read(repo.join("docs/images/shot-1.png")).unwrap(),
            b"old 1"
        );
        assert_eq!(
            std::fs::read(repo.join("docs/images/shot-2.png")).unwrap(),
            b"new"
        );

        let again = import_image(&repo, "docs/images", &file, &source).unwrap();
        assert_eq!(again.path, "docs/images/shot-3.png");
        cleanup(&repo);
    }

    #[test]
    fn an_image_already_in_the_image_root_is_linked_as_is() {
        let repo = temp_repo("inside");
        let file = repo.join("docs/a.md");
        std::fs::create_dir_all(repo.join("docs/images/sub")).unwrap();
        let source = repo.join("docs/images/sub/x.jpg");
        std::fs::write(&source, b"jpg").unwrap();
        let image = import_image(&repo, "docs/images", &file, &source).unwrap();
        assert_eq!(image.markdown, "![x](images/sub/x.jpg)");
        assert!(!image.copied);
        assert_eq!(
            std::fs::read_dir(repo.join("docs/images")).unwrap().count(),
            1
        );
        cleanup(&repo);
    }

    #[test]
    fn refuses_what_is_not_an_image() {
        let repo = temp_repo("refuse");
        let file = repo.join("docs/planning/next/a.md");
        let text = repo.parent().unwrap().join("notes.txt");
        std::fs::write(&text, b"x").unwrap();
        let err = import_image(&repo, "docs/images", &file, &text).unwrap_err();
        assert!(err.contains("not an image"), "{err}");
        let missing = repo.parent().unwrap().join("gone.png");
        let err = import_image(&repo, "docs/images", &file, &missing).unwrap_err();
        assert!(err.contains("not found"), "{err}");
        let folder = repo.parent().unwrap().join("folder.png");
        std::fs::create_dir_all(&folder).unwrap();
        let err = import_image(&repo, "docs/images", &file, &folder).unwrap_err();
        assert!(err.contains("not a file"), "{err}");
        assert!(
            !repo.join("docs/images").exists()
                || std::fs::read_dir(repo.join("docs/images")).unwrap().count() == 0
        );
        cleanup(&repo);
    }

    #[test]
    fn refuses_an_open_file_outside_the_repository() {
        let repo = temp_repo("outside");
        let source = repo.parent().unwrap().join("a.png");
        std::fs::write(&source, b"x").unwrap();
        let file = repo.parent().unwrap().join("other.md");
        let err = import_image(&repo, "docs/images", &file, &source).unwrap_err();
        assert!(err.contains("not inside the repository"), "{err}");
        cleanup(&repo);
    }

    #[test]
    fn a_pasted_image_gets_a_generated_name_and_a_suffix_when_taken() {
        let repo = temp_repo("paste");
        let file = repo.join("docs/planning/next/a.md");
        let stamp = "20261031-103600";
        let image = paste_image(&repo, "docs/images", &file, "image/png", b"one", stamp).unwrap();
        assert_eq!(
            image,
            ImportedImage {
                markdown: "![pasted-20261031-103600](../../images/pasted-20261031-103600.png)"
                    .to_string(),
                path: "docs/images/pasted-20261031-103600.png".to_string(),
                copied: true,
            }
        );
        let again = paste_image(&repo, "docs/images", &file, "IMAGE/JPEG", b"two", stamp).unwrap();
        assert_eq!(again.path, "docs/images/pasted-20261031-103600.jpg");
        let third = paste_image(&repo, "docs/images", &file, "image/png", b"three", stamp).unwrap();
        assert_eq!(third.path, "docs/images/pasted-20261031-103600-1.png");
        assert_eq!(
            std::fs::read(repo.join("docs/images/pasted-20261031-103600.png")).unwrap(),
            b"one"
        );
        assert_eq!(
            std::fs::read(repo.join("docs/images/pasted-20261031-103600-1.png")).unwrap(),
            b"three"
        );
        cleanup(&repo);
    }

    #[test]
    fn a_paste_that_is_not_an_image_or_too_large_is_refused() {
        let repo = temp_repo("paste-refuse");
        let file = repo.join("docs/planning/next/a.md");
        let err =
            paste_image(&repo, "docs/images", &file, "application/pdf", b"x", "s").unwrap_err();
        assert!(err.contains("not an image"), "{err}");
        let large = vec![0u8; MAX_IMAGE_BYTES as usize + 1];
        let err = paste_image(&repo, "docs/images", &file, "image/png", &large, "s").unwrap_err();
        assert!(err.contains("larger than 20 MB"), "{err}");
        assert!(!repo.join("docs/images").exists());
        cleanup(&repo);
    }

    #[test]
    fn relative_links_go_up_then_down_and_encode() {
        let link = relative_link(
            Path::new("/r/docs/planning/next"),
            Path::new("/r/docs/images/a b(1)#.png"),
        );
        assert_eq!(link, "../../images/a%20b%281%29%23.png");
        assert_eq!(percent_decode(&link), "../../images/a b(1)#.png");
        assert_eq!(
            relative_link(Path::new("/r"), Path::new("/r/img/x.png")),
            "img/x.png"
        );
        assert_eq!(
            relative_link(Path::new("/r/a"), Path::new("/r/a/x.png")),
            "x.png"
        );
    }
}
