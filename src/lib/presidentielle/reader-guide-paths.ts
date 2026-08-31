const READER_GUIDE_BASE_PATH = "/elections/presidentielle-2027/reperes";

export function presidentialReaderGuidesPath(): string {
  return READER_GUIDE_BASE_PATH;
}

export function presidentialReaderGuidePath(slug: string): string {
  return `${READER_GUIDE_BASE_PATH}/${slug}`;
}
