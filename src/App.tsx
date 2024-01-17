import { nanoid } from "nanoid";
import { For, createEffect, createSignal } from "solid-js";
import CatalogItem from "./CatalogItem";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { MessageType, UiMessageType } from "./shared";

const sendUiMessage = (message: UiMessageType) => {
  parent.postMessage(message, "*");
};

const App = () => {
  const [catalogs, setCatalogs] = createSignal<Catalog[]>([]);
  const [catalogTitle, setCatalogTitle] = createSignal("");
  const [catalogUrl, setCatalogUrl] = createSignal("");

  createEffect(() => {
    const onMessage = (event: MessageEvent<MessageType>) => {
      switch (event.data.type) {
        case "get-catalogs":
          setCatalogs(event.data.catalogs);
          break;
      }
    };

    window.addEventListener("message", onMessage);
    sendUiMessage({ type: "get-catalogs" });
    return () => window.removeEventListener("message", onMessage);
  });

  const onAdd = () => {
    const catalog: Catalog = {
      id: nanoid(),
      name: catalogTitle(),
      apiId: catalogUrl(),
    };
    sendUiMessage({ type: "add-catalog", catalog });
    setCatalogTitle("");
    setCatalogUrl("");
  };

  const onUpdate = (catalog: Catalog) => {
    sendUiMessage({ type: "update-catalog", catalog });
  };

  const onRemove = (catalog: Catalog) => {
    sendUiMessage({ type: "delete-catalog", catalog });
  };

  return (
    <div class="flex flex-col gap-2 mx-4">
      <ul>
        <For each={catalogs()}>
          {(c, i) => (
            <CatalogItem catalog={c} update={onUpdate} remove={onRemove} />
          )}
        </For>
      </ul>
      <Accordion multiple={true} collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Add Catalog</AccordionTrigger>
          <AccordionContent>
            <div class="flex flex-col gap-2 space-y-2 p-1">
              <Input
                name="title"
                placeholder="Title"
                value={catalogTitle()}
                onChange={(e) => {
                  setCatalogTitle(e.currentTarget.value);
                }}
              />
              <Input
                name="Url"
                placeholder="OPDS Url"
                value={catalogUrl()}
                onChange={(e) => {
                  setCatalogUrl(e.currentTarget.value);
                }}
              />

              <Button onClick={onAdd} disabled={!catalogTitle()}>
                Add
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default App;
