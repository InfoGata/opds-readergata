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

export const linkIsRel = (link: Link, rel: string | ((r: string) => boolean)) => {
  if (!link.HasRel || !link.Rel) return false;
  const rels = link.Rel.split(" ");
  return typeof rel === "function"
    ? rels.some(rel)
    : rels.some((x) => x === rel);
};

export const isCatalogEntry = (entry: Entry) => {
  return (
    entry.Links &&
    entry.Links.some((link) =>
      linkIsRel(link, (rel) =>
        rel.startsWith("http://opds-spec.org/acquisition")
      )
    )
  );
};

export const isAcquisitionFeed = (feed: OPDS) => {
  return feed.Entries && feed.Entries.some(isCatalogEntry);
};

export const getImage = (entry: Entry) => {
  for (const rel of imageRels) {
    const link = entry.Links.find((x) => linkIsRel(x, rel));
    if (link) {
      return link.Href;
    }
  }
  return "";
};

export const getLink = (origin: string, entry: Entry): string | undefined => {
  let href = entry.Links.find((l) =>
    l.Type.startsWith("application/atom+xml")
  )?.Href;
  href = href?.startsWith("/") ? href : `/${href}`;
  return `${origin}${href}`;
};

const acquisitionRel = "http://opds-spec.org/acquisition";

const acquisitionTypes: Record<string, AcquisitionType> = {
  "open-access": "open-access",
  borrow: "borrow",
  buy: "buy",
  sample: "sample",
  subscribe: "subscribe",
};

/**
 * The kind of acquisition a link offers, from the suffix of its rel. The bare
 * `.../acquisition` rel says nothing about how, so it stays undefined.
 */
export const getAcquisitionType = (link: Link): AcquisitionType | undefined => {
  const rel = link.Rel?.split(" ").find((r) => r.startsWith(acquisitionRel));
  if (!rel || rel === acquisitionRel) return undefined;
  return acquisitionTypes[rel.slice(acquisitionRel.length + 1)];
};

export const getAcquisitionUrls = (
  origin: string,
  entry: Entry
): PublicationSource[] => {
  return entry.Links.filter((l) => l.Rel.startsWith(acquisitionRel)).map(
    (l): PublicationSource => ({
      name: l.Title,
      source: l.Href.indexOf("://") === -1 ? `${origin}${l.Href}` : l.Href,
      type: l.Type,
      price: l.OpdsPrice,
      currency: l.OpdsPriceCurrencyCode,
      acquisitionType: getAcquisitionType(l),
    })
  );
};

const toAbsoluteUrl = (origin: string, href: string) =>
  href.indexOf("://") === -1
    ? `${origin}${href.startsWith("/") ? href : `/${href}`}`
    : href;

/**
 * Url of the entry's own OPDS document, which is what `apiId` points at and
 * what `onGetPublicationDetails` is later handed back.
 *
 * Feeds advertise this in three different ways and plenty don't advertise it
 * at all — those publications simply don't get a page of their own.
 */
export const getEntryUrl = (
  origin: string,
  entry: Entry
): string | undefined => {
  const candidates = [
    // An explicit entry document, the OPDS way of saying "the full record".
    (l: Link) => l.Type?.includes("type=entry"),
    (l: Link) => linkIsRel(l, "self"),
    (l: Link) =>
      linkIsRel(l, "alternate") && l.Type?.startsWith("application/atom+xml"),
  ];

  for (const matches of candidates) {
    const link = entry.Links?.find(matches);
    if (link?.Href) return toAbsoluteUrl(origin, link.Href);
  }
  return undefined;
};

/** The human-readable page for this book on the catalog's own site. */
export const getOriginalUrl = (
  origin: string,
  entry: Entry
): string | undefined => {
  const link = entry.Links?.find(
    (l) => linkIsRel(l, "alternate") && l.Type?.startsWith("text/html")
  );
  return link?.Href ? toAbsoluteUrl(origin, link.Href) : undefined;
};

/**
 * Normalizes the several date shapes an entry can carry into an ISO string.
 *
 * `DcIssued` arrives as a string but `Published`/`Updated` are already `Date`
 * objects, converted by r2's xml mapper — and either can be nonsense.
 */
export const toIsoDate = (value: string | Date | undefined) => {
  if (!value) return undefined;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  // Bare years are common and worth keeping verbatim rather than anchoring to
  // a January 1st that the catalog never claimed.
  if (/^\d{4}$/.test(value.trim())) return value.trim();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const toNumber = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * The one place an OPDS entry becomes a Publication, shared by the feed
 * listing and the single-entry detail fetch so that a book doesn't change
 * shape when you click on it.
 */
export const entryToPublication = (
  origin: string,
  entry: Entry
): Publication => ({
  title: entry.Title,
  subtitle: entry.SubTitle || undefined,
  apiId: getEntryUrl(origin, entry),
  authors: entry.Authors?.map(
    (a): Author => ({ name: a.Name, url: a.Uri || undefined })
  ),
  images: [{ url: getImage(entry) }],
  summary: entry.Summary || entry.Content || undefined,
  publisher: entry.DcPublisher || undefined,
  languages: entry.DcLanguage ? [entry.DcLanguage] : undefined,
  published: toIsoDate(entry.DcIssued) ?? toIsoDate(entry.Published),
  categories: entry.Categories?.map(
    (c): Category => ({ name: c.Label || c.Term, scheme: c.Scheme || undefined })
  ),
  // r2 models this as a list, though a book belongs to one series in practice.
  series: entry.Series?.[0]
    ? { name: entry.Series[0].Name, position: entry.Series[0].Position }
    : undefined,
  pageCount: toNumber(entry.DcExtent),
  rights: entry.DcRights || undefined,
  identifiers: entry.DcIdentifier
    ? [
        {
          type: (entry.DcIdentifierType || "urn").toLowerCase(),
          value: entry.DcIdentifier,
        },
      ]
    : undefined,
  rating: toNumber(entry.SchemaRatingValue),
  sources: getAcquisitionUrls(origin, entry),
  originalUrl: getOriginalUrl(origin, entry),
});

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

const fetchOpdsDocument = async (url: string) => {
  const response = await fetch(`${proxyUrl}${encodeURIComponent(url)}`);
  const responseString = await response.text();
  const xmlDom = new xmldom.DOMParser().parseFromString(responseString);
  if (!xmlDom || !xmlDom.documentElement) {
    throw new Error(`Not valid XML: ${url}`);
  }
  return { origin: new URL(url).origin, xmlDom };
};

const makeOpdsRequest = async (url: string): Promise<Feed> => {
  const { origin, xmlDom } = await fetchOpdsDocument(url);
  // A single entry is a publication, not a catalog. Reaching one here means a
  // catalog apiId pointed at a book.
  if (xmlDom.documentElement.localName === "entry") {
    throw new Error(`Expected a feed but got a single entry: ${url}`);
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
    let books: Publication[] = feed.Entries.map((e) =>
      entryToPublication(origin, e)
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

export const setCatalogs = (catalogs: Catalog[]) => {
  localStorage.setItem("catalogs", JSON.stringify(catalogs));
};

export const addCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  currentCatalogs.push(catalog);
  setCatalogs(currentCatalogs);
};

export const updateCatalog = (catalog: Catalog) => {
  const currentCatalogs = getCatalogs();
  const newCatalogs = currentCatalogs.map((c) =>
    c.id === catalog.id ? catalog : c
  );
  setCatalogs(newCatalogs);
};

export const deleteCatalog = (catalog: Catalog) => {
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

export const getDefaultCatalogs = (): Catalog[] => {
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

export const getCatalogs = (): Catalog[] => {
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

application.onGetPublicationSource = async (
  request: GetPublicationSourceRequest
) => {
  const proxy = proxyUrl;
  const result = await fetch(`${proxy}${encodeURIComponent(request.source)}`);

  const blob = await result.blob();
  const response: GetPublicationSourceResponse = {
    source: await blobToString(blob),
    sourceType: "binary",
  };

  return response;
};

application.onGetPublicationDetails = async (
  request: GetPublicationDetailsRequest
): Promise<Publication> => {
  const { origin, xmlDom } = await fetchOpdsDocument(request.apiId);
  // The url usually resolves to a bare <entry> document, but some servers
  // answer it with a feed holding that one entry instead.
  const entry =
    xmlDom.documentElement.localName === "entry"
      ? XML.deserialize<Entry>(xmlDom, Entry)
      : XML.deserialize<OPDS>(xmlDom, OPDS).Entries?.[0];
  if (!entry) {
    throw new Error(`No entry at ${request.apiId}`);
  }
  return entryToPublication(origin, entry);
};

application.onSearch = onSearch;

const changeTheme = (theme: Theme) => {
  localStorage.setItem("vite-ui-theme", theme);
};
application.onChangeTheme = async (theme: Theme) => {
  changeTheme(theme);
};

const init = async () => {
  const theme = await application.getTheme();
  changeTheme(theme);
};
init();
