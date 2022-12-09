import * as xmldom from "@xmldom/xmldom";
import { OPDS } from "@r2-opds-js/opds/opds1/opds";
import { Entry } from "@r2-opds-js/opds/opds1/opds-entry";
import { XML } from "@r2-utils-js/_utils/xml-js-mapper";
import { Link } from "@r2-opds-js/opds/opds1/opds-link";
import {
  initGlobalConverters_GENERIC,
  initGlobalConverters_OPDS,
} from "@r2-opds-js/opds/init-globals";

// window.Buffer = window.Buffer || require("buffer").Buffer;
initGlobalConverters_GENERIC();
initGlobalConverters_OPDS();

const proxiedUrl = "http://localhost:36325/"; //"https://cloudcors.audio-pwa.workers.dev?url=";

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

const makeOpdsRequest = async (url: string): Promise<Feed> => {
  const response = await fetch(`${proxiedUrl}${url}`);
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
  // const search = feed.Links.find((link) => linkIsRel(link, "search"));
  // if (search) {
  //   const absoluteReg = new RegExp("^(?:[a-z]+:)?//", "i");
  //   const openSearchUrl = absoluteReg.test(search.Href)
  //     ? search.Href
  //     : `${origin}${search.Href}`;
  //   setSearchUrl(openSearchUrl);
  // }
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
    };
  }
};

export const defaultCatalogs: Catalog[] = [
  {
    name: "SimplyE Collection",
    apiId: "https://circulation.librarysimplified.org/OPEN/",
  },
  {
    name: "Calibre",
    apiId: "http://127.0.0.1:8081/opds",
  },
  {
    name: "Internet Archive",
    apiId: "http://bookserver.archive.org/catalog/",
  },
];

application.onGetFeed = async (request: GetFeedRequest) => {
  if (request.apiId) {
    return makeOpdsRequest(request.apiId);
  } else {
    return { type: "catalog", items: defaultCatalogs };
  }
};
