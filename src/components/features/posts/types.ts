import type { Page } from "astro";
import type { CollectionEntry } from "astro:content";

import type { ApiPostEntry } from "../../../adapters/api-adapter";

/** 文章条目：支持本地 content collection 或 API 数据源 */
export type PostEntry = CollectionEntry<"posts"> | ApiPostEntry;

export interface PostCardProps {
	class?: string;
	entry: PostEntry;
	style?: string;
}

export interface PostMetaProps {
	published: Date;
	updated?: Date;
	category?: string;
	tags?: string[];
	hideUpdateDate?: boolean;
	hideTagsForMobile?: boolean;
	isHome?: boolean;
	className?: string;
	id?: string;
	showOnlyBasicMeta?: boolean;
	words?: number;
	minutes?: number;
	showWordCount?: boolean;
}

export interface PostPageProps {
	page: Page<PostEntry>;
}
