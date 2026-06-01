import { useMemo } from "react";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";

export type EditorLanguage = "json" | "javascript" | "text";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  height?: string;
  placeholder?: string;
}

export function CodeEditor(props: Props): JSX.Element {
  const extensions = useMemo<Extension[]>(() => {
    switch (props.language) {
      case "json":
        return [json()];
      case "javascript":
        return [javascript()];
      default:
        return [];
    }
  }, [props.language]);

  return (
    <CodeMirror
      value={props.value}
      onChange={props.onChange}
      extensions={extensions}
      readOnly={props.readOnly}
      placeholder={props.placeholder}
      height={props.height ?? "240px"}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: !props.readOnly,
        highlightActiveLineGutter: !props.readOnly,
        bracketMatching: true,
        autocompletion: !props.readOnly,
        tabSize: 2,
      }}
      theme="light"
    />
  );
}
