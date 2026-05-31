import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { BLOCK_TYPES } from "../constants";
import { getBlockTypeConfig, initials } from "../helpers";
import { useRemotePresenceRenderer } from "../realtime";
import {
  flushBlockSave,
  focusBlock,
  getCaretOffset,
  getSelectionInBody,
  isBlockLocalTextDirty,
  scheduleBlockSave,
  schedulePresenceUpdate,
  showErrorToast,
  useAppStore,
} from "../store";
import type { Block, TypeMenuState } from "../types";

function getSelectionOffsets(
  body: HTMLDivElement,
  selection: Selection,
): { start: number; end: number } {
  const range = selection.getRangeAt(0);

  const startRange = range.cloneRange();
  startRange.selectNodeContents(body);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(body);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
}

function onBlockKeydown(
  event: React.KeyboardEvent<HTMLDivElement>,
  block: Block,
  body: HTMLDivElement,
  openTypeMenu: (menu: TypeMenuState | null) => void,
): void {
  const page = useAppStore.getState().currentPage;
  if (!page) return;

  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const selection = getSelectionInBody(body);
    if (!selection || !selection.isCollapsed) return;

    const offset = getCaretOffset(body, selection);
    const total = body.textContent?.length ?? 0;
    const index = page.rootBlockIds.indexOf(block.id);

    if (event.key === "ArrowUp" && offset === 0 && index > 0) {
      event.preventDefault();
      focusBlock(page.rootBlockIds[index - 1], "end");
      return;
    }

    if (
      event.key === "ArrowDown" &&
      offset === total &&
      index >= 0 &&
      index < page.rootBlockIds.length - 1
    ) {
      event.preventDefault();
      focusBlock(page.rootBlockIds[index + 1], "start");
      return;
    }
  }

  if (
    event.key === "/" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    const text = body.textContent ?? "";
    if (text.trim() === "") {
      event.preventDefault();
      const rect = body.getBoundingClientRect();
      openTypeMenu({
        blockId: block.id,
        top: rect.top + window.scrollY + 28,
        left: rect.left + window.scrollX,
        fromSlash: true,
      });
      return;
    }
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    const text = body.textContent ?? "";

    const selection = getSelectionInBody(body);
    const offsets = selection
      ? getSelectionOffsets(body, selection)
      : { start: text.length, end: text.length };

    const leadingText = text.slice(0, offsets.start);
    const trailingText = text.slice(offsets.end);
    body.textContent = leadingText;

    void (async () => {
      try {
        await flushBlockSave(block.id, leadingText);
        await useAppStore
          .getState()
          .addBlock(block.type, block.id, trailingText, "start");
      } catch (error) {
        showErrorToast(error, "Failed to split block");
      }
    })();
    return;
  }

  if (
    event.key === "Backspace" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    page.rootBlockIds.length > 1
  ) {
    const selection = getSelectionInBody(body);
    if (!selection || !selection.isCollapsed) return;

    const offset = getCaretOffset(body, selection);
    if (offset !== 0) return;

    const index = page.rootBlockIds.indexOf(block.id);
    if (index <= 0) return;

    const previousId = page.rootBlockIds[index - 1];
    if (!previousId) return;

    const previousBlock = page.blocks[previousId];
    if (!previousBlock) return;

    event.preventDefault();

    const currentText = body.textContent ?? "";
    const mergedText = `${previousBlock.text ?? ""}${currentText}`;

    void (async () => {
      try {
        await useAppStore
          .getState()
          .updateBlock(previousId, { text: mergedText });
        await useAppStore.getState().deleteBlock(block.id);
        focusBlock(previousId);
      } catch (error) {
        showErrorToast(error, "Failed to merge blocks");
      }
    })();
  }
}

function BlockRow({
  block,
  numberedCounter,
}: {
  block: Block;
  numberedCounter: number;
}): JSX.Element {
  const setTypeMenu = useAppStore((state) => state.setTypeMenu);
  const deleteBlock = useAppStore((state) => state.deleteBlock);
  const updateBlock = useAppStore((state) => state.updateBlock);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    if (isBlockLocalTextDirty(block.id)) return;

    const nextText = block.text ?? "";
    if (document.activeElement !== body && body.textContent !== nextText) {
      body.textContent = nextText;
    }
  }, [block.id, block.text]);

  const placeholder = getBlockTypeConfig(block.type).placeholder;

  return (
    <div
      className="block"
      data-block-id={block.id}
      data-type={block.type}
      data-checked={block.type === "todo" ? String(!!block.checked) : undefined}
    >
      <div className="block-gutter">
        <Button
          variant="ghost"
          size="icon"
          className="gutter-btn type-btn"
          title="Change type"
          onClick={(event) => {
            event.stopPropagation();
            const rect = (
              event.currentTarget as HTMLButtonElement
            ).getBoundingClientRect();
            setTypeMenu({
              blockId: block.id,
              top: rect.bottom + window.scrollY + 4,
              left: rect.left + window.scrollX,
              fromSlash: false,
            });
          }}
        >
          p
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="gutter-btn delete-btn"
          title="Delete"
          onClick={() => {
            deleteBlock(block.id).catch((error) => {
              showErrorToast(error, "Failed to delete block");
            });
          }}
        >
          x
        </Button>
      </div>

      {block.type === "todo" ? (
        <span
          className={`todo-check${block.checked ? " checked" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            updateBlock(block.id, { checked: !block.checked }).catch(
              (error) => {
                showErrorToast(error, "Failed to update block");
              },
            );
          }}
        />
      ) : null}

      <div
        ref={bodyRef}
        className="block-body"
        contentEditable={block.type !== "divider"}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-number={
          block.type === "numbered_list" ? String(numberedCounter) : undefined
        }
        onFocus={() => schedulePresenceUpdate()}
        onBlur={() => {
          scheduleBlockSave(block.id, bodyRef.current?.textContent ?? "");
          schedulePresenceUpdate();
        }}
        onInput={() => {
          scheduleBlockSave(block.id, bodyRef.current?.textContent ?? "");
          schedulePresenceUpdate();
        }}
        onKeyUp={() => schedulePresenceUpdate()}
        onMouseUp={() => schedulePresenceUpdate()}
        onClick={() => schedulePresenceUpdate()}
        onKeyDown={(event) => {
          const body = bodyRef.current;
          if (!body) return;
          onBlockKeydown(event, block, body, setTypeMenu);
        }}
      />
    </div>
  );
}

function TypeMenu(): JSX.Element | null {
  const typeMenu = useAppStore((state) => state.typeMenu);
  const setTypeMenu = useAppStore((state) => state.setTypeMenu);
  const updateBlock = useAppStore((state) => state.updateBlock);

  useEffect(() => {
    if (!typeMenu) return;

    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".type-menu")) {
        setTypeMenu(null);
      }
    };

    setTimeout(() => {
      document.addEventListener("click", close);
    }, 0);

    return () => {
      document.removeEventListener("click", close);
    };
  }, [setTypeMenu, typeMenu]);

  if (!typeMenu) return null;

  return (
    <div
      className="type-menu"
      style={{ top: typeMenu.top, left: typeMenu.left }}
    >
      {BLOCK_TYPES.map((entry) => (
        <Button
          key={entry.type}
          variant="ghost"
          className="h-8 w-full justify-start rounded px-2 text-sm"
          onClick={() => {
            updateBlock(typeMenu.blockId, { type: entry.type }).catch(
              (error) => {
                showErrorToast(error, "Failed to update block type");
              },
            );
            setTypeMenu(null);
            focusBlock(typeMenu.blockId);
          }}
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
}

export function EditorPane(): JSX.Element {
  const auth = useAppStore((state) => state.auth);
  const currentPage = useAppStore((state) => state.currentPage);
  const presence = useAppStore((state) => state.presence);
  const setPageTitle = useAppStore((state) => state.setPageTitle);
  const addBlock = useAppStore((state) => state.addBlock);

  useRemotePresenceRenderer();

  const [title, setTitle] = useState(currentPage?.title ?? "");
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(currentPage?.title ?? "");
  }, [currentPage?.pageId, currentPage?.title]);

  const numberedCounters = useMemo(() => {
    if (!currentPage) return new Map<string, number>();
    const counters = new Map<string, number>();
    let number = 0;
    for (const id of currentPage.rootBlockIds) {
      const block = currentPage.blocks[id];
      if (!block) continue;
      if (block.type === "numbered_list") {
        number += 1;
      } else {
        number = 0;
      }
      counters.set(id, number);
    }
    return counters;
  }, [currentPage]);

  if (!currentPage) {
    return (
      <main className="page-pane">
        <div className="empty">
          <p>Select a page on the left, or create a new one.</p>
        </div>
      </main>
    );
  }

  const others = Object.values(presence).filter(
    (entry) => entry.userId !== auth?.userId,
  );

  return (
    <main className="page-pane">
      <article>
        <header className="page-header">
          <div className="presence">
            {others.map((entry) => (
              <span
                key={entry.userId}
                className="avatar"
                style={{ background: entry.color }}
                title={entry.displayName}
              >
                {initials(entry.displayName)}
              </span>
            ))}
          </div>

          <Input
            className="page-title"
            placeholder="Untitled"
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value;
              setTitle(nextTitle);
              if (titleTimerRef.current) {
                clearTimeout(titleTimerRef.current);
              }
              titleTimerRef.current = setTimeout(() => {
                setPageTitle(nextTitle).catch((error) => {
                  showErrorToast(error, "Failed to update title");
                });
              }, 300);
            }}
          />
        </header>

        <div className="blocks">
          {currentPage.rootBlockIds.map((id) => {
            const block = currentPage.blocks[id];
            if (!block) return null;
            const number = numberedCounters.get(id) ?? 0;
            return (
              <BlockRow key={block.id} block={block} numberedCounter={number} />
            );
          })}
        </div>

        <Button
          variant="ghost"
          className="add-block h-9 px-2 text-sm"
          onClick={() => {
            addBlock().catch((error) => {
              showErrorToast(error, "Failed to add block");
            });
          }}
        >
          + Add block
        </Button>
      </article>

      <TypeMenu />
    </main>
  );
}
