export interface ImageInfo {
  url: string;
  height?: number;
  width?: number;
}

export interface Publication {
  title: string;
  images?: ImageInfo[];
  summary?: string;
  authors?: Author[];
  apiId?: string;
  sources?: PublicationSource[];
}

export interface PublicationSource {
  name?: string;
  source: string;
  type?: string;
}

export interface Author {
  name: string;
}

export interface Application {
  onGetPublication(request: GetPublicationRequest): Promise<Publication>;
  onGetFeed(request: GetFeedRequest): Promise<Feed>;
}

export interface GetPublicationRequest {
  apiId: string;
}

export interface GetFeedRequest {
  apiId?: string;
}

export interface Catalog {
  name: string;
  pluginId?: string;
  apiId?: string;
}

export type CatalogFeed = {
  type: "catalog";
  items: Catalog[];
};

export type PublicationFeed = {
  type: "publication";
  items: Publication[];
};

export type Feed = CatalogFeed | PublicationFeed;
