declare module "@toast-ui/editor" {
  interface EditorOptions {
    el: HTMLElement;
    initialEditType?: "markdown" | "wysiwyg";
    previewStyle?: "tab" | "vertical";
    height?: string;
    initialValue?: string;
    usageStatistics?: boolean;
    theme?: string;
    toolbarItems?: (string | string[])[];
    events?: Record<string, (...args: unknown[]) => void>;
  }
  export default class Editor {
    constructor(options: EditorOptions);
    getMarkdown(): string;
    destroy(): void;
  }
}

declare module "@toast-ui/editor/dist/toastui-editor.css";
