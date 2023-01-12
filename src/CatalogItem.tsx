import { Close, Edit } from "@mui/icons-material";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  ListItem,
  ListItemText,
  Stack,
  TextField,
} from "@mui/material";
import { FunctionComponent } from "preact";
import { useState } from "preact/hooks";

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
      <ListItem
        secondaryAction={
          <IconButton
            edge="end"
            aria-label="edit"
            onClick={open ? onClose : onEdit}
          >
            {open ? <Close /> : <Edit />}
          </IconButton>
        }
      >
        <ListItemText primary={catalog.name} secondary={catalog.apiId} />
      </ListItem>
      {
        <Collapse in={open}>
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => {
                setTitle(e.currentTarget.value);
              }}
            />
            <TextField
              label="OPDS Url"
              value={url}
              onChange={(e) => {
                setUrl(e.currentTarget.value);
              }}
            />
            <Button variant="contained" color="error" onClick={onRemove}>
              Remove
            </Button>
            <Button variant="contained" color="success" onClick={onSave}>
              Update
            </Button>
          </Stack>
        </Collapse>
      }
    </>
  );
};

export default CatalogItem;
