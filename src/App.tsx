import { ExpandMore } from "@mui/icons-material";
import {
  Box,
  CssBaseline,
  TextField,
  Button,
  List,
  Stack,
  Accordion,
  AccordionSummary,
  Typography,
  AccordionDetails,
} from "@mui/material";
import { nanoid } from "nanoid";
import { FunctionComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import CatalogItem from "./CatalogItem";
import { MessageType, UiMessageType } from "./shared";

const sendUiMessage = (message: UiMessageType) => {
  parent.postMessage(message, "*");
};

const App: FunctionComponent = () => {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogTitle, setCatalogTitle] = useState("");
  const [catalogUrl, setCatalogUrl] = useState("");

  useEffect(() => {
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
  }, []);

  const onAdd = () => {
    const catalog: Catalog = {
      id: nanoid(),
      name: catalogTitle,
      apiId: catalogUrl,
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
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <Stack spacing={2}>
        <List>
          {catalogs.map((c) => (
            <CatalogItem
              key={c.id}
              catalog={c}
              update={onUpdate}
              remove={onRemove}
            />
          ))}
        </List>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography>Add Catalog</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <TextField
                name="title"
                label="Title"
                value={catalogTitle}
                onChange={(e) => {
                  setCatalogTitle(e.currentTarget.value);
                }}
              />
              <TextField
                name="Url"
                label="OPDS Url"
                value={catalogUrl}
                onChange={(e) => {
                  setCatalogUrl(e.currentTarget.value);
                }}
              />

              <Button
                variant="contained"
                onClick={onAdd}
                disabled={!catalogTitle}
              >
                Add
              </Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Stack>
    </Box>
  );
};

export default App;
