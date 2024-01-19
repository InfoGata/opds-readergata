import { ColorModeProvider } from "@kobalte/core";
import App from "./App";
import { render } from "solid-js/web";

export const init = () => {
  render(
    () => (
      <ColorModeProvider>
        <App />
      </ColorModeProvider>
    ),
    document.body
  );
};
