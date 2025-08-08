import * as xmldom from "@xmldom/xmldom";
import { OPDS } from "@r2-opds-js/opds/opds1/opds";
import { Entry } from "@r2-opds-js/opds/opds1/opds-entry";
import { XML } from "@r2-utils-js/_utils/xml-js-mapper";
import { Link } from "@r2-opds-js/opds/opds1/opds-link";
import {
  initGlobalConverters_GENERIC,
  initGlobalConverters_OPDS,
} from "@r2-opds-js/opds/init-globals";
import { MessageType, UiMessageType } from "./shared";

import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;
initGlobalConverters_GENERIC();
initGlobalConverters_OPDS();

const proxyUrl = "https://vercelcors-three.vercel.app/api?url=";

const imageRels = [
  //"http://opds-spec.org/image",
  //"http://opds-spec.org/cover",
  "http://opds-spec.org/image/thumbnail",
  "http://opds-spec.org/thumbnail",
];

const linkIsRel = (link: Link, rel: string | ((r: string) => boolean)) => {
  if (!link.HasRel || !link.Rel) return false;
  const rels = link.Rel.split(" ");
  return typeof rel === "function"
    ? rels.some(rel)
    : rels.some((x) => x === rel);
};

const isCatalogEntry = (entry: Entry) => {
  return (
    entry.Links &&
    entry.Links.some((link) =>
      linkIsRel(link, (rel) =>
        rel.startsWith("http://opds-spec.org/acquisition")
      )
    )
  );
};

const isAcquisitionFeed = (feed: OPDS) => {
  return feed.Entries && feed.Entries.some(isCatalogEntry);
};

const getImage = (entry: Entry) => {
  for (const rel of imageRels) {
    const link = entry.Links.find((x) => linkIsRel(x, rel));
    if (link) {
      return link.Href;
    }
  }
  return "";
};

const getLink = (origin: string, entry: Entry): string | undefined => {
  let href = entry.Links.find((l) =>
    l.Type.startsWith("application/atom+xml")
  )?.Href;
  href = href?.startsWith("/") ? href : `/${href}`;
  return `${origin}${href}`;
};

const getAcquisitionUrls = (
  origin: string,
  entry: Entry
): PublicationSource[] => {
  const acquisitionUrl = "http://opds-spec.org/acquisition";
  return entry.Links.filter((l) => l.Rel.startsWith(acquisitionUrl)).map(
    (l): PublicationSource => ({
      name: l.Title,
      source: l.Href.indexOf("://") === -1 ? `${origin}${l.Href}` : l.Href,
      type: l.Type,
    })
  );
};

const onSearch = async (request: SearchRequest): Promise<Feed> => {
  const searchUrl = request.searchInfo;
  if (!searchUrl) {
    throw new Error("Doesn't have search rule");
  }
  const proxy = proxyUrl;
  const searchData = await fetch(`${proxy}${encodeURIComponent(searchUrl)}`);
  const searchText = await searchData.text();
  const parser = new DOMParser();
  const openSearchDoc = parser.parseFromString(searchText, "application/xml");
  const urls = openSearchDoc.querySelectorAll("Url");
  const opdsUrl = Array.from(urls).find((url) =>
    url.getAttribute("type")?.includes("application/atom+xml")
  );

  if (!opdsUrl) {
    throw new Error("Failed to search");
  }

  const template = opdsUrl.getAttribute("template");
  if (!template) {
    throw new Error("Failed to search");
  }
  // Exmaple: https://standardebooks.org/ebooks?query={searchTerms}
  const queryUrl = template?.replace("{searchTerms}", request.query);
  return makeOpdsRequest(queryUrl);
};

const makeOpdsRequest = async (url: string): Promise<Feed> => {
  const proxy = proxyUrl;
  const response = await fetch(`${proxy}${encodeURIComponent(url)}`);
  const origin = new URL(url).origin;
  const responseString = await response.text();
  const xmlDom = new xmldom.DOMParser().parseFromString(responseString);
  if (!xmlDom || !xmlDom.documentElement) {
    throw new Error();
  }
  const isEntry = xmlDom.documentElement.localName === "entry";
  if (isEntry) {
    throw new Error();
  }

  let feed = XML.deserialize<OPDS>(xmlDom, OPDS);
  const search = feed.Links.find((link) => linkIsRel(link, "search"));
  let searchInfo = "";
  if (search) {
    const absoluteReg = new RegExp("^(?:[a-z]+:)?//", "i");
    const openSearchUrl = absoluteReg.test(search.Href)
      ? search.Href
      : `${origin}${search.Href}`;
    searchInfo = openSearchUrl;
  }
  if (isAcquisitionFeed(feed)) {
    let books: Publication[] = feed.Entries.map(
      (e): Publication => ({
        title: e.Title,
        authors: e.Authors?.map((a) => ({ name: a.Name })),
        images: [{ url: getImage(e) }],
        summary: e.Summary,
        sources: getAcquisitionUrls(origin, e),
      })
    );
    return {
      type: "publication",
      items: books,
    };
  } else {
    return {
      type: "catalog",
      items: feed.Entries.map(
        (e): Catalog => ({
          name: e.Title,
          apiId: getLink(origin, e) || "",
        })
      ),
      searchInfo: searchInfo,
      hasSearch: !!searchInfo,
    };
  }
};

const sendMessage = (message: MessageType) => {
  application.postUiMessage(message);
};

const sendCatalogs = () => {
  sendMessage({
    type: "get-catalogs",
    catalogs: getCatalogs(),
  });
};

const setCatalogs = (catalogs: Catalog[]) => {
  localStorage.setItem("catalogs", JSON.stringify(catalogs));
};

const addCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  currentCatalogs.push(catalog);
  setCatalogs(currentCatalogs);
};

const updateCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  const newCatalogs = currentCatalogs.map((c) =>
    c.id === catalog.id ? catalog : c
  );
  setCatalogs(newCatalogs);
};

const deleteCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  const newCatalogs = currentCatalogs.filter((c) => c.id !== catalog.id);
  setCatalogs(newCatalogs);
};

application.onUiMessage = async (message: UiMessageType) => {
  switch (message.type) {
    case "get-catalogs":
      sendCatalogs();
      break;
    case "add-catalog":
      addCatalog(message.catalog);
      sendCatalogs();
      break;
    case "update-catalog":
      updateCatalog(message.catalog);
      sendCatalogs();
      break;
    case "delete-catalog":
      deleteCatalog(message.catalog);
      sendCatalogs();
      break;
    default:
      const _exhaustive: never = message;
      break;
  }
};

const getDefaultCatalogs = (): Catalog[] => {
  return [
    {
      id: "1",
      name: "SimplyE Collection",
      apiId: "https://circulation.librarysimplified.org/OPEN/",
    },
    {
      id: "3",
      name: "Open Textbook",
      apiId: "http://open.minitex.org/textbooks",
    },
    {
      id: "4",
      name: "Project Gutenberg",
      apiId: "https://m.gutenberg.org/ebooks.opds/",
    },
  ];
};

const getCatalogs = (): Catalog[] => {
  const catalogString = localStorage.getItem("catalogs");
  if (catalogString) {
    const catalogs = JSON.parse(catalogString) as Catalog[];
    return catalogs;
  }
  return getDefaultCatalogs();
};

application.onGetFeed = async (request: GetFeedRequest) => {
  if (request.apiId) {
    return makeOpdsRequest(request.apiId);
  } else {
    return { type: "catalog", items: getCatalogs() };
  }
};

export const blobToString = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (res) => {
      resolve(res.target?.result as string);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(blob);
  });
};

application.onGetPublication = async (request: GetPublicationRequest) => {
  const proxy = proxyUrl;
  const result = await fetch(`${proxy}${encodeURIComponent(request.source)}`);

  const blob = await result.blob();
  const response: GetPublicationResponse = {
    source: await blobToString(blob),
    sourceType: "binary",
  };

  return response;
};

application.onSearch = onSearch;

const changeTheme = (theme: Theme) => {
  localStorage.setItem("kb-color-mode", theme);
};
application.onChangeTheme = async (theme: Theme) => {
  changeTheme(theme);
};

const init = async () => {
  const theme = await application.getTheme();
  changeTheme(theme);
};
init();
