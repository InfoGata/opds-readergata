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

type UiGetInfo = {
  type: "get-info";
};

export type UiMessageType =
  | UiGetCatalogs
  | UiAddCatalog
  | UiUpdateCatalog
  | UiDeleteCatalog
  | UiGetInfo;

type GetInfoType = {
  type: "get-info";
  extensionInstalled: boolean;
};

type CatalogsType = {
  type: "get-catalogs";
  catalogs: Catalog[];
};

export type MessageType = CatalogsType | GetInfoType;
