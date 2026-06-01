import { createRoot } from "react-dom/client";
import "./styles.css";
import { PostmanApp } from "./features/postman";

const rootElement = document.getElementById("app");
if (!rootElement) {
  throw new Error("Missing #app root element");
}

createRoot(rootElement).render(<PostmanApp />);
