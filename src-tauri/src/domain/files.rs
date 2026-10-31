//! Reading and writing files opened in the editor (`S-editor-core`) without overwriting changes
//! made on disk meanwhile (`S-conflicts`), and the images read mode shows (`S-editor-layout`).

use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

const NO_LONGER_EXISTS: &str = "the file no longer exists";

/// What happened to a save.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SaveOutcome {
    /// The file now holds the saved text.
    Saved,
    /// The file changed on disk since it was read; it was left as is and holds `text`.
    ChangedOnDisk { text: String },
}

/// What read mode gets for a local image (`S-images`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ImageRead {
    /// The image as a `data:` URL.
    Shown { url: String },
    /// No file at the place the link points to, such as an image root not synced to this
    /// machine (D-20260919-104200-9f03).
    Missing,
}

/// Images larger than this are not shown in read mode, nor copied into the image root.
pub(crate) const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

/// The whole text of the file at `path`.
pub fn read_text(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|err| err.to_string())
}

/// Replaces the text of the file at `path`. Never creates a file: a file that was moved or
/// removed since it was opened is not written back to its old place.
pub fn write_existing(path: &Path, text: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|err| match err.kind() {
            ErrorKind::NotFound => NO_LONGER_EXISTS.to_string(),
            _ => err.to_string(),
        })?;
    file.write_all(text.as_bytes())
        .map_err(|err| err.to_string())
}

/// Writes `text` to the file at `path` if the file still holds `expected`, the text last read
/// from or written to it. A file that already holds `text` counts as saved. Never creates a
/// file.
pub fn save_text(path: &Path, expected: &str, text: &str) -> Result<SaveOutcome, String> {
    let disk = std::fs::read_to_string(path).map_err(|err| match err.kind() {
        ErrorKind::NotFound => NO_LONGER_EXISTS.to_string(),
        _ => err.to_string(),
    })?;
    if disk == text {
        return Ok(SaveOutcome::Saved);
    }
    if disk != expected {
        return Ok(SaveOutcome::ChangedOnDisk { text: disk });
    }
    write_existing(path, text)?;
    Ok(SaveOutcome::Saved)
}

/// Creates the file at `path` with `text`, for a file removed while it had unsaved edits.
/// Never overwrites a file.
pub fn create_text(path: &Path, text: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|err| match err.kind() {
            ErrorKind::AlreadyExists => "a file with this name exists again".to_string(),
            _ => err.to_string(),
        })?;
    file.write_all(text.as_bytes())
        .map_err(|err| err.to_string())
}

/// Moves the file at `path` to the OS trash (`S-trash`, `R-no-destroy`). Only files inside
/// `repo_root` are moved; nothing is ever removed for good.
pub fn trash_file(repo_root: &Path, path: &Path) -> Result<(), String> {
    trash_file_with(repo_root, path, os_trash)
}

fn trash_file_with(
    repo_root: &Path,
    path: &Path,
    trash: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let file = path
        .canonicalize()
        .map_err(|_| NO_LONGER_EXISTS.to_string())?;
    let root = repo_root.canonicalize().map_err(|err| err.to_string())?;
    if !file.starts_with(&root) {
        return Err(format!("{} is outside the repository", path.display()));
    }
    if !file.is_file() {
        return Err(format!("{} is not a file", path.display()));
    }
    trash(&file)
}

/// The OS trash. On macOS through `NSFileManager`, which needs no automation permission;
/// Finder then offers no "Put Back", but the file is in the Trash as usual.
fn os_trash(path: &Path) -> Result<(), String> {
    #[allow(unused_mut)] // Only macOS changes the context.
    let mut context = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        context.set_delete_method(DeleteMethod::NsFileManager);
    }
    context
        .delete(path)
        .map_err(|err| format!("could not move to the trash: {err}"))
}

/// The image `src` of the markdown file `file` as a `data:` URL, or `Missing` when no file is
/// there. `src` is relative to the folder of `file`, or to `repo_root` when it starts with `/`;
/// it must stay inside `repo_root`. Remote and other non-file sources are refused, since the
/// app makes no network calls.
pub fn image_data_url(repo_root: &Path, file: &Path, src: &str) -> Result<ImageRead, String> {
    let src = src.split(['#', '?']).next().unwrap_or_default();
    if src.is_empty() || has_scheme(src) {
        return Err(format!("`{src}` is not a local image"));
    }
    let decoded = percent_decode(src);
    let relative = Path::new(&decoded);
    let base = if decoded.starts_with('/') {
        repo_root.to_path_buf()
    } else {
        file.parent().unwrap_or(repo_root).to_path_buf()
    };
    let joined = relative
        .components()
        .filter(|part| !matches!(part, Component::RootDir | Component::Prefix(_)))
        .fold(base, |path: PathBuf, part| path.join(part));
    let Ok(path) = joined.canonicalize() else {
        return Ok(ImageRead::Missing);
    };
    let root = repo_root.canonicalize().map_err(|err| err.to_string())?;
    if !path.starts_with(&root) {
        return Err(format!("`{src}` is outside the repository"));
    }
    let mime = image_mime(&path).ok_or_else(|| format!("`{src}` is not an image"))?;
    let size = path.metadata().map_err(|err| err.to_string())?.len();
    if size > MAX_IMAGE_BYTES {
        return Err(format!("`{src}` is larger than 20 MB"));
    }
    let bytes = std::fs::read(&path).map_err(|err| err.to_string())?;
    Ok(ImageRead::Shown {
        url: format!("data:{mime};base64,{}", base64(&bytes)),
    })
}

/// Whether `src` starts with a URL scheme such as `https:` or `data:`. A Windows drive letter
/// counts as a scheme too, so absolute paths are refused.
pub(crate) fn has_scheme(src: &str) -> bool {
    src.split_once(':').is_some_and(|(scheme, _)| {
        !scheme.is_empty()
            && scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    })
}

pub(crate) fn image_mime(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        _ => return None,
    })
}

/// Decodes `%XX` escapes as markdown links write them for spaces and other characters.
pub(crate) fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let escaped = (bytes[i] == b'%')
            .then(|| text.get(i + 1..i + 3))
            .flatten()
            .and_then(|hex| u8::from_str_radix(hex, 16).ok());
        match escaped {
            Some(byte) => {
                out.push(byte);
                i += 3;
            }
            None => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, &byte)| n | u32::from(byte) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ALPHABET[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("stardust-files-{name}-{}", fastrand::u32(..)));
        std::fs::create_dir_all(dir.join("docs/planning/next")).unwrap();
        std::fs::create_dir_all(dir.join("docs/images")).unwrap();
        dir
    }

    #[test]
    fn base64_matches_the_standard_alphabet_and_padding() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64(&[0xff, 0xfe, 0xfd]), "//79");
    }

    #[test]
    fn writes_only_files_that_exist() {
        let repo = temp_repo("write");
        let file = repo.join("docs/planning/next/a.md");
        assert_eq!(
            write_existing(&file, "x"),
            Err("the file no longer exists".to_string())
        );
        assert!(!file.exists());
        std::fs::write(&file, "old text that is longer").unwrap();
        write_existing(&file, "new").unwrap();
        assert_eq!(read_text(&file).unwrap(), "new");
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn saves_only_over_the_expected_text() {
        let repo = temp_repo("save");
        let file = repo.join("docs/planning/next/a.md");
        assert_eq!(save_text(&file, "", "x"), Err(NO_LONGER_EXISTS.to_string()));
        std::fs::write(&file, "old").unwrap();
        assert_eq!(save_text(&file, "old", "mine"), Ok(SaveOutcome::Saved));
        assert_eq!(read_text(&file).unwrap(), "mine");
        std::fs::write(&file, "agent").unwrap();
        assert_eq!(
            save_text(&file, "mine", "mine 2"),
            Ok(SaveOutcome::ChangedOnDisk {
                text: "agent".to_string()
            })
        );
        assert_eq!(read_text(&file).unwrap(), "agent");
        assert_eq!(save_text(&file, "mine", "agent"), Ok(SaveOutcome::Saved));
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn creates_only_files_that_do_not_exist() {
        let repo = temp_repo("create");
        let file = repo.join("docs/planning/next/a.md");
        create_text(&file, "restored").unwrap();
        assert_eq!(read_text(&file).unwrap(), "restored");
        assert!(
            create_text(&file, "again")
                .unwrap_err()
                .contains("exists again")
        );
        assert_eq!(read_text(&file).unwrap(), "restored");
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn trashes_only_existing_files_inside_the_repository() {
        let repo = temp_repo("trash");
        let file = repo.join("docs/planning/next/a.md");
        std::fs::write(&file, "x").unwrap();
        let mut trashed = Vec::new();
        trash_file_with(&repo, &file, |path| {
            trashed.push(path.to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(trashed, [file.canonicalize().unwrap()]);

        let never = |_: &Path| -> Result<(), String> { panic!("must not trash") };
        let folder = repo.join("docs/planning/next");
        assert!(
            trash_file_with(&repo, &folder, never)
                .unwrap_err()
                .contains("not a file")
        );
        let missing = repo.join("docs/planning/next/missing.md");
        assert_eq!(
            trash_file_with(&repo, &missing, never),
            Err(NO_LONGER_EXISTS.to_string())
        );
        let outside_name = format!("stardust-trash-outside-{}.md", fastrand::u32(..));
        let outside = repo.parent().unwrap().join(outside_name);
        std::fs::write(&outside, "x").unwrap();
        let err = trash_file_with(&repo, &outside, never).unwrap_err();
        std::fs::remove_file(&outside).unwrap();
        assert!(err.contains("outside the repository"), "{err}");
        let sneaky = repo
            .join("docs/planning/next/../../../../")
            .join(outside.file_name().unwrap());
        std::fs::write(&outside, "x").unwrap();
        let err = trash_file_with(&repo, &sneaky, never).unwrap_err();
        std::fs::remove_file(&outside).unwrap();
        assert!(err.contains("outside the repository"), "{err}");
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn reads_images_relative_to_the_file_or_the_repository() {
        let repo = temp_repo("image");
        let file = repo.join("docs/planning/next/a.md");
        std::fs::write(repo.join("docs/images/my shot.png"), b"foo").unwrap();
        let expected = Ok(ImageRead::Shown {
            url: "data:image/png;base64,Zm9v".to_string(),
        });
        assert_eq!(
            image_data_url(&repo, &file, "../../images/my%20shot.png"),
            expected
        );
        assert_eq!(
            image_data_url(&repo, &file, "/docs/images/my shot.png#x"),
            expected
        );
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn refuses_remote_outside_and_non_image_sources() {
        let repo = temp_repo("refuse");
        let file = repo.join("docs/planning/next/a.md");
        std::fs::write(repo.join("docs/notes.txt"), b"x").unwrap();
        for src in [
            "https://example.com/a.png",
            "data:image/png;base64,AA",
            "C:/a.png",
            "",
        ] {
            assert!(
                image_data_url(&repo, &file, src)
                    .unwrap_err()
                    .contains("not a local image")
            );
        }
        let outside_name = format!("stardust-outside-{}.png", fastrand::u32(..));
        let outside_path = repo.parent().unwrap().join(&outside_name);
        std::fs::write(&outside_path, b"x").unwrap();
        let outside = image_data_url(&repo, &file, &format!("../../../../{outside_name}"));
        std::fs::remove_file(outside_path).unwrap();
        assert!(outside.unwrap_err().contains("outside the repository"));
        assert!(
            image_data_url(&repo, &file, "../../notes.txt")
                .unwrap_err()
                .contains("not an image")
        );
        assert_eq!(
            image_data_url(&repo, &file, "missing.png"),
            Ok(ImageRead::Missing)
        );
        std::fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn percent_decoding_leaves_broken_escapes_alone() {
        assert_eq!(percent_decode("a%20b%zz%"), "a b%zz%");
        assert_eq!(percent_decode("%C3%A4"), "ä");
    }
}
