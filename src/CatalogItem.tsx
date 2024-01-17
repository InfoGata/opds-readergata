import { Component, Show, createSignal } from "solid-js";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { IconX, IconEdit } from "@tabler/icons-solidjs";

interface CatalogItemProps {
  catalog: Catalog;
  update: (catalog: Catalog) => void;
  remove: (catalog: Catalog) => void;
}

const CatalogItem: Component<CatalogItemProps> = (props) => {
  const { catalog, update, remove } = props;
  const [title, setTitle] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [open, setOpen] = createSignal(false);

  const onEdit = () => {
    setOpen(true);
    setTitle(catalog.name);
    setUrl(catalog.apiId || "");
  };

  const onClose = () => {
    setOpen(false);
  };

  const onSave = () => {
    update({ ...catalog, name: title(), apiId: url() });
    onClose();
  };

  const onRemove = () => {
    remove(catalog);
  };

  return (
    <>
      <div class="m-1 flex space-x-4 py-2 transition-all hover:bg-accent/50 hover:text-accent-foreground items-center">
        <div class="space-y-1 w-full">
          <p class="text-sm font-medium leading-none">{catalog.name}</p>
          <p class="text-sm text-muted-foreground">{catalog.apiId}</p>
        </div>
        <Button variant="ghost" onClick={open() ? onClose : onEdit} size="icon">
          {open() ? <IconX /> : <IconEdit />}
        </Button>
      </div>
      <Show when={open()}>
        <div class="flex flex-col gap-2">
          <Input
            placeholder="Title"
            value={title()}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
            }}
          />
          <Input
            placeholder="OPDS Url"
            value={url()}
            onChange={(e) => {
              setUrl(e.currentTarget.value);
            }}
          />
          <Button variant="destructive" onClick={onRemove}>
            Remove
          </Button>
          <Button onClick={onSave}>Update</Button>
        </div>
      </Show>
    </>
  );
};

export default CatalogItem;
