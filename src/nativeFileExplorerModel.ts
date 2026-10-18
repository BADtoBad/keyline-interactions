import { localize } from './locale/ui';
const trimSlashes = (path: string): string => path.replace(/^\/+|\/+$/gu, "");

export type FileVisualKind = "markdown" | "pdf" | "epub" | "image" | "audio" | "video" | "canvas" | "code" | "archive" | "generic";

const IMAGE_EXTENSIONS = new Set([
	"avif",
	"bmp",
	"gif",
	"heic",
	"heif",
	"ico",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"tif",
	"tiff",
	"webp",
]);

export const fileVisualKindForPath = (path: string, extensionHint = ""): FileVisualKind => {
	const fileName = path.split("/").pop() ?? "";
	const dot = fileName.lastIndexOf(".");
	const extension = (dot > 0 ? fileName.slice(dot + 1) : extensionHint)
		.trim()
		.toLocaleLowerCase("en-US");
	if (extension === "md") return "markdown";
	if (extension === "pdf") return "pdf";
	if (extension === "epub") return "epub";
	if (IMAGE_EXTENSIONS.has(extension)) return "image";
	if (["mp3", "wav", "m4a", "ogg", "flac", "aac", "opus", "aiff"].includes(extension)) return "audio";
	if (["mp4", "webm", "mov", "mkv", "ogv", "avi"].includes(extension)) return "video";
	if (extension === "canvas") return "canvas";
	if (["js", "ts", "jsx", "tsx", "json", "css", "html", "py", "sh", "yaml", "yml", "xml", "sql", "toml"].includes(extension)) return "code";
	if (["zip", "7z", "rar", "tar", "gz", "bz2", "xz"].includes(extension)) return "archive";
	return "generic";
};

export const joinVaultPath = (folderPath: string, childName: string): string => {
	const folder = trimSlashes(folderPath.trim());
	const child = trimSlashes(childName.trim());
	return folder.length > 0 ? `${folder}/${child}` : child;
};

export const nextAvailableMarkdownPath = (
	folderPath: string,
	exists: (path: string) => boolean,
	baseName = localize("未命名")
): string => {
	let suffix = 0;
	while (true) {
		const fileName = suffix === 0 ? `${baseName}.md` : `${baseName} ${suffix}.md`;
		const candidate = joinVaultPath(folderPath, fileName);
		if (!exists(candidate)) return candidate;
		suffix += 1;
	}
};
