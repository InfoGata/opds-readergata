type UiGetCatalogs = {
  type: "get-catalogs";
};

type UiAddCatalog = {
  type: "add-catalog";
  catalog: Catalog;
};

type UiUpdateCatalog = {
  type: "update-catalog";
  catalog: Catalog;
};

type UiDeleteCatalog = {
  type: "delete-catalog";
  catalog: Catalog;
};

export type UiMessageType =
  | UiGetCatalogs
  | UiAddCatalog
  | UiUpdateCatalog
  | UiDeleteCatalog;

type CatalogsType = {
  type: "get-catalogs";
  catalogs: Catalog[];
};

export type MessageType = CatalogsType;
