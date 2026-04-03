/**
 * Mizuki API 数据源适配器
 *
 * 通过环境变量 DATA_SOURCE 切换数据源：
 * - 'local' (默认): 使用 Astro content collection 从本地 Markdown 读取
 * - 'api':       从 NestJS 后端 API 获取数据
 *
 * 使用方式：
 *   DATA_SOURCE=api API_BASE=http://localhost:3000 pnpm dev
 */

import MarkdownIt from "markdown-it";

const DATA_SOURCE = (import.meta.env.DATA_SOURCE as string) || "local";
const API_BASE =
	(import.meta.env.API_BASE as string) || "http://localhost:3000";

// 共享的 markdown-it 实例（与 RSS/Atom feed 使用相同的配置）
const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

export interface ApiPost {
	id: number;
	slug: string;
	title: string;
	content: string;
	description: string;
	image: string;
	tags: string[];
	category: string;
	lang: string;
	published: string;
	updated: string | null;
	draft: boolean;
	pinned: boolean;
	comment: boolean;
	priority: number | null;
	author: string;
	sourceLink: string;
	licenseName: string;
	licenseUrl: string;
	encrypted: boolean;
	password: string;
	passwordHint: string;
	alias: string | null;
	permalink: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * API 模式下的文章条目格式
 * 兼容 CollectionEntry<"posts"> 的核心字段
 */
export interface ApiPostEntry {
	id: string;
	slug: string;
	body: string;
	collection: "posts";
	data: ApiPostData;
	/** 渲染后的 HTML 内容 */
	renderedHtml?: string;
	/** 标题列表（从 markdown 提取） */
	headings?: { depth: number; slug: string; text: string }[];
	/** 兼容 CollectionEntry 的 filePath (API 模式下为空) */
	filePath?: string;
}

/**
 * 兼容 CollectionEntry<"posts">["data"] 的数据结构
 */
export interface ApiPostData {
	title: string;
	published: Date;
	updated?: Date;
	draft: boolean;
	description: string;
	image: string;
	tags: string[];
	category: string;
	lang: string;
	pinned: boolean;
	comment: boolean;
	priority?: number;
	author: string;
	sourceLink: string;
	licenseName: string;
	licenseUrl: string;
	encrypted: boolean;
	password: string;
	passwordHint: string;
	alias?: string;
	permalink?: string;
	// 前后导航（由 content-utils 填充，与 CollectionEntry data 类型对齐）
	prevTitle: string;
	prevSlug: string;
	nextTitle: string;
	nextSlug: string;
}

/**
 * 从 markdown 内容中提取标题（模拟 Astro render() 的 headings 输出）
 */
function extractHeadings(
	markdown: string,
): { depth: number; slug: string; text: string }[] {
	const headings: { depth: number; slug: string; text: string }[] = [];
	const headingRegex = /^(#{1,6})\s+(.+)$/gm;
	let match: RegExpExecArray | null;

	while ((match = headingRegex.exec(markdown)) !== null) {
		const depth = match[1].length;
		const text = match[2].replace(/`.*?`/g, "").trim(); // 移除行内代码
		const slug = text
			.toLowerCase()
			.replace(/[^\w\s\u4e00-\u9fff-]/g, "")
			.replace(/\s+/g, "-");
		headings.push({ depth, slug, text });
	}

	return headings;
}

/**
 * 将 API 返回的 Post 数据转换为类 CollectionEntry 格式
 */
export function apiPostToEntry(post: ApiPost): ApiPostEntry {
	const publishedDate = new Date(post.published);
	return {
		id: post.slug,
		slug: post.slug,
		body: post.content,
		collection: "posts",
		data: {
			title: post.title,
			published: publishedDate,
			updated: post.updated ? new Date(post.updated) : undefined,
			draft: post.draft,
			description: post.description || "",
			image: post.image || "",
			tags: post.tags || [],
			category: post.category || "",
			lang: post.lang || "",
			pinned: post.pinned,
			comment: post.comment,
			priority: post.priority ?? undefined,
			author: post.author || "",
			sourceLink: post.sourceLink || "",
			licenseName: post.licenseName || "",
			licenseUrl: post.licenseUrl || "",
			encrypted: post.encrypted,
			password: post.password || "",
			passwordHint: post.passwordHint || "",
			alias: post.alias || undefined,
			permalink: post.permalink || undefined,
			// 前后导航默认空值（由 content-utils 填充）
			prevTitle: "",
			prevSlug: "",
			nextTitle: "",
			nextSlug: "",
		},
		// 预计算渲染结果
		renderedHtml: md.render(post.content),
		headings: extractHeadings(post.content),
	};
}

/**
 * 获取所有文章列表（仅非草稿），已排序
 *
 * 排序逻辑与 content-utils.ts 中 getRawSortedPosts() 保持一致：
 * 1. 置顶文章在前
 * 2. 置顶文章按 priority 升序
 * 3. 其余按发布日期降序
 */
export async function getApiPosts(): Promise<ApiPostEntry[]> {
	if (DATA_SOURCE !== "api") {
		return [];
	}

	try {
		const response = await fetch(`${API_BASE}/api/posts?pageSize=1000`);
		if (!response.ok) {
			throw new Error(`API error: ${response.status}`);
		}
		const result = await response.json();

		if (result.success === false) {
			console.error("[api-adapter] API Error:", result.error);
			return [];
		}

		const { list } = result.data as { list: ApiPost[] };
		// 过滤草稿文章
		const entries = list.filter((p) => !p.draft).map(apiPostToEntry);

		// 应用与本地模式相同的排序逻辑
		entries.sort((a, b) => {
			if (a.data.pinned && !b.data.pinned) {
				return -1;
			}
			if (!a.data.pinned && b.data.pinned) {
				return 1;
			}

			if (a.data.pinned && b.data.pinned) {
				const pa = a.data.priority;
				const pb = b.data.priority;
				if (pa !== undefined && pb !== undefined && pa !== pb) {
					return pa - pb;
				}
				if (pa !== undefined) {
					return -1;
				}
				if (pb !== undefined) {
					return 1;
				}
			}

			return b.data.published.getTime() - a.data.published.getTime();
		});

		return entries;
	} catch (error) {
		console.error("[api-adapter] Failed to fetch posts from API:", error);
		return [];
	}
}

/**
 * 根据 slug 获取单篇文章详情
 */
export async function getApiPostBySlug(
	slug: string,
): Promise<ApiPostEntry | null> {
	if (DATA_SOURCE !== "api") {
		return null;
	}

	try {
		const response = await fetch(
			`${API_BASE}/api/posts/${encodeURIComponent(slug)}`,
		);
		if (!response.ok) {
			if (response.status === 404) {
				return null;
			}
			throw new Error(`API error: ${response.status}`);
		}
		const result = await response.json();

		if (result.success === false) {
			console.error("[api-adapter] API Error:", result.error);
			return null;
		}

		return apiPostToEntry(result.data as ApiPost);
	} catch (error) {
		console.error(`[api-adapter] Failed to fetch post "${slug}":`, error);
		return null;
	}
}

/**
 * 获取所有分类列表
 */
export async function getApiCategories(): Promise<string[]> {
	if (DATA_SOURCE !== "api") {
		return [];
	}

	try {
		const response = await fetch(`${API_BASE}/api/posts/categories`);
		const result = await response.json();
		return (result.data as string[]) || [];
	} catch {
		return [];
	}
}

/**
 * 获取所有标签列表及计数
 */
export async function getApiTagsWithCount(): Promise<
	{ name: string; count: number }[]
> {
	if (DATA_SOURCE !== "api") {
		return [];
	}

	try {
		// 通过文章列表聚合标签计数（API 端点只返回标签名列表）
		const posts = await getApiPosts();
		const countMap: Record<string, number> = {};
		posts.forEach((post) => {
			(post.data.tags || []).forEach((tag: string) => {
				countMap[tag] = (countMap[tag] || 0) + 1;
			});
		});
		return Object.entries(countMap)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) =>
				a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
			);
	} catch {
		return [];
	}
}

/**
 * 获取所有分类列表及计数和 URL
 */
export async function getApiCategoriesWithCount(): Promise<
	{ name: string; count: number; url: string }[]
> {
	if (DATA_SOURCE !== "api") {
		return [];
	}

	try {
		const posts = await getApiPosts();
		const countMap: Record<string, number> = {};
		posts.forEach((post) => {
			const cat = post.data.category || "";
			const key = cat.trim() || "未分类";
			countMap[key] = (countMap[key] || 0) + 1;
		});

		// 动态导入避免循环依赖
		const { getCategoryUrl } = await import("@utils/url-utils");

		return Object.keys(countMap)
			.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
			.map((name) => ({
				name,
				count: countMap[name],
				url: getCategoryUrl(name === "未分类" ? "" : name),
			}));
	} catch {
		return [];
	}
}

/**
 * 检查当前是否使用 API 数据源
 */
export function isApiDataSource(): boolean {
	return DATA_SOURCE === "api";
}

/**
 * 获取当前数据源模式
 */
export function getDataSourceMode(): string {
	return DATA_SOURCE;
}
