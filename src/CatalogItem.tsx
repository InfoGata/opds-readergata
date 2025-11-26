import { useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { X, Pencil } from "lucide-react";

interface CatalogItemProps {
  catalog: Catalog;
  update: (catalog: Catalog) => void;
  remove: (catalog: Catalog) => void;
}

const CatalogItem: FunctionComponent<CatalogItemProps> = (props) => {
  const { catalog, update, remove } = props;
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  const onEdit = () => {
    setOpen(true);
    setTitle(catalog.name);
    setUrl(catalog.apiId || "");
  };

  const onClose = () => {
    setOpen(false);
  };

  const onSave = () => {
    update({ ...catalog, name: title, apiId: url });
    onClose();
  };

  const onRemove = () => {
    remove(catalog);
  };

  return (
    <>
      <div className="m-1 flex space-x-4 py-2 transition-all hover:bg-accent/50 hover:text-accent-foreground items-center">
        <div className="space-y-1 w-full">
          <p className="text-sm font-medium leading-none">{catalog.name}</p>
          <p className="text-sm text-muted-foreground">{catalog.apiId}</p>
        </div>
        <Button variant="ghost" onClick={open ? onClose : onEdit} size="icon">
          {open ? <X /> : <Pencil />}
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Title"
            value={title}
            onChange={(e: any) => {
              setTitle((e.target as HTMLInputElement).value);
            }}
          />
          <Input
            placeholder="OPDS Url"
            value={url}
            onChange={(e: any) => {
              setUrl((e.target as HTMLInputElement).value);
            }}
          />
          <Button variant="destructive" onClick={onRemove}>
            Remove
          </Button>
          <Button onClick={onSave}>Update</Button>
        </div>
      )}
    </>
  );
};

export default CatalogItem;
