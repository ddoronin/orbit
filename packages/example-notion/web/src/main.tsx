import { createRoot } from "react-dom/client";
import "./styles.css";
import { NotionApp } from "./features/notion";

const rootElement = document.getElementById("app");
if (!rootElement) {
  throw new Error("Missing #app root element");
}

createRoot(rootElement).render(<NotionApp />);
