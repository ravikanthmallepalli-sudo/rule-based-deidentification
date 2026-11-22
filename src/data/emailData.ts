// Data for the EMAIL detector (EMAIL_detection_rules.md §4 constants, §5).

// Length limits (RFC limits, §4 constants and L9).
export const LOCAL_PART_MAX_LENGTH = 64; // code points of an unquoted or quoted local part
export const LOCAL_PART_SCAN_LIMIT = 70; // how far the backward scan from `@` may go
export const QUOTED_SEARCH_LIMIT = 66; // how far back the opening quote of "..."@ may be
export const LABEL_MAX_LENGTH = 63; // one domain label
export const DOMAIN_MAX_LENGTH = 253; // the whole domain (also the forward scan limit)
export const TLD_MIN_LENGTH = 2; // the last label needs at least 2 letters

// Characters an unquoted local part may contain besides letters, digits and marks (D4).
export const LOCAL_PART_SYMBOLS: readonly string[] = ["_", ".", "%", "+", "'", "-"];

// File-extension deny list (§5.4, D8): a "domain" ending in one of these is a file name (`icon@2x.png`).
// None is a real TLD (January 2025 IANA copy); real TLDs such as zip, mov, app, dev, java are NOT listed.
export const FILE_EXTENSION_DENY_LIST: readonly string[] = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "tsv",
  "json", "xml", "yaml", "yml", "html", "htm", "css", "js", "jsx", "tsx", "ini",
  "log", "bak", "tmp", "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "heic",
  "avif", "tiff", "ico", "exe", "dll", "jar", "class", "cpp", "php", "lock", "toml",
];
