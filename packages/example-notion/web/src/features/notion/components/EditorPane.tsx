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

type MenuSubsection = "turn-into" | "color" | "move-to" | null;
type DropHint = { blockId: string; position: "before" | "after" } | null;

const TEXT_COLOR_SWATCHES: Array<{ label: string; value: string | null }> = [
  { label: "Default", value: null },
  { label: "Gray", value: "#6b7280" },
  { label: "Brown", value: "#7d6252" },
  { label: "Terracotta", value: "#b4533f" },
  { label: "Amber", value: "#a86a2f" },
  { label: "Olive", value: "#7c6f2b" },
  { label: "Green", value: "#15803d" },
  { label: "Blue", value: "#295fa7" },
  { label: "Indigo", value: "#5b4ba1" },
  { label: "Rose", value: "#9c4b6a" },
];

const BG_COLOR_SWATCHES: Array<{ label: string; value: string | null }> = [
  { label: "Default", value: null },
  { label: "Gray", value: "#f3f4f6" },
  { label: "Brown", value: "#f8eee6" },
  { label: "Red", value: "#fee2e2" },
  { label: "Orange", value: "#ffedd5" },
  { label: "Yellow", value: "#fef9c3" },
  { label: "Green", value: "#dcfce7" },
  { label: "Blue", value: "#dbeafe" },
  { label: "Purple", value: "#ede9fe" },
  { label: "Pink", value: "#fce7f3" },
];

const LEGACY_COLOR_MAP: Record<string, string> = {
  "#dc2626": "#b4533f",
  "#ea580c": "#a86a2f",
  "#a16207": "#7c6f2b",
  "#2563eb": "#295fa7",
  "#7c3aed": "#5b4ba1",
  "#be185d": "#9c4b6a",
};

function normalizeBlockColor(
  color: string | null | undefined,
): string | undefined {
  if (!color) return undefined;
  const key = color.trim().toLowerCase();
  return LEGACY_COLOR_MAP[key] ?? color;
}

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
    event.key === "Tab" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault();

    if (event.shiftKey) {
      const parentId = block.parentId;
      if (!parentId) return;
      const parentBlock = page.blocks[parentId];
      const grandParentId = parentBlock?.parentId ?? null;

      void useAppStore
        .getState()
        .moveBlock(block.id, grandParentId, parentId)
        .catch((error) => {
          showErrorToast(error, "Failed to outdent block");
        });
      return;
    }

    const index = page.rootBlockIds.indexOf(block.id);
    if (index <= 0) return;

    const previousId = page.rootBlockIds[index - 1];
    const previousBlock = page.blocks[previousId];
    if (!previousBlock) return;

    const afterChildId =
      previousBlock.children.length > 0
        ? previousBlock.children[previousBlock.children.length - 1]
        : null;

    void useAppStore
      .getState()
      .moveBlock(block.id, previousId, afterChildId)
      .catch((error) => {
        showErrorToast(error, "Failed to indent block");
      });
    return;
  }

  if (
    event.key.toLowerCase() === "d" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    event.metaKey
  ) {
    event.preventDefault();
    void useAppStore
      .getState()
      .duplicateBlock(block.id)
      .catch((error) => {
        showErrorToast(error, "Failed to duplicate block");
      });
    return;
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
  draggingBlockId,
  dropHint,
  onBlockDragStart,
  onBlockDragOver,
  onBlockDrop,
  onBlockDragEnd,
}: {
  block: Block;
  numberedCounter: number;
  draggingBlockId: string | null;
  dropHint: DropHint;
  onBlockDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    blockId: string,
  ) => void;
  onBlockDragOver: (
    event: React.DragEvent<HTMLDivElement>,
    blockId: string,
  ) => void;
  onBlockDrop: (
    event: React.DragEvent<HTMLDivElement>,
    blockId: string,
  ) => void;
  onBlockDragEnd: () => void;
}): JSX.Element {
  const setTypeMenu = useAppStore((state) => state.setTypeMenu);
  const deleteBlock = useAppStore((state) => state.deleteBlock);
  const updateBlock = useAppStore((state) => state.updateBlock);
  const duplicateBlock = useAppStore((state) => state.duplicateBlock);
  const moveBlock = useAppStore((state) => state.moveBlock);
  const auth = useAppStore((state) => state.auth);
  const currentPage = useAppStore((state) => state.currentPage);
  const showToast = useAppStore((state) => state.showToast);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [submenu, setSubmenu] = useState<MenuSubsection>(null);

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

  const closeBlockMenu = () => {
    setMenuPosition(null);
    setSubmenu(null);
  };

  useEffect(() => {
    if (!menuPosition) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          `.block-context-menu[data-block-menu-id="${block.id}"]`,
        ) ||
        target.closest(
          `.block-handle-btn[data-block-menu-trigger="${block.id}"]`,
        )
      ) {
        return;
      }
      closeBlockMenu();
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBlockMenu();
    };

    const onScroll = () => closeBlockMenu();

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [block.id, menuPosition]);

  const openBlockMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      top: rect.top,
      left: rect.right + 8,
    });
    setSubmenu(null);
  };

  const getSiblingContext = () => {
    if (!currentPage) {
      return {
        siblings: [] as string[],
        index: -1,
        parentId: null as string | null,
      };
    }

    const parentId = block.parentId ?? null;
    const siblings = parentId
      ? (currentPage.blocks[parentId]?.children ?? [])
      : currentPage.rootBlockIds;
    const index = siblings.indexOf(block.id);

    return { siblings, index, parentId };
  };

  const moveWithinSiblings = async (
    direction: "up" | "down" | "top" | "bottom",
  ) => {
    const { siblings, index, parentId } = getSiblingContext();
    if (index < 0) return;

    let afterBlockId: string | null = null;
    if (direction === "up") {
      if (index === 0) return;
      afterBlockId = index - 2 >= 0 ? siblings[index - 2] : null;
    } else if (direction === "down") {
      if (index >= siblings.length - 1) return;
      afterBlockId = siblings[index + 1] ?? null;
    } else if (direction === "top") {
      afterBlockId = null;
    } else {
      const withoutCurrent = siblings.filter((id) => id !== block.id);
      afterBlockId =
        withoutCurrent.length > 0 ? (withoutCurrent.at(-1) ?? null) : null;
    }

    await moveBlock(block.id, parentId, afterBlockId);
    closeBlockMenu();
  };

  const copyLinkToBlock = async () => {
    try {
      const url = new URL(window.location.href);
      url.hash = `block-${block.id}`;
      await navigator.clipboard.writeText(url.toString());
      showToast("Copied link to block");
      closeBlockMenu();
    } catch (error) {
      showErrorToast(error, "Failed to copy block link");
    }
  };

  const formattedUpdatedAt = new Date(
    currentPage?.updatedAt ?? Date.now(),
  ).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const blockClasses = [
    "block",
    draggingBlockId === block.id ? "block-dragging" : "",
    dropHint?.blockId === block.id && dropHint.position === "before"
      ? "block-drop-before"
      : "",
    dropHint?.blockId === block.id && dropHint.position === "after"
      ? "block-drop-after"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={`block-${block.id}`}
      className={blockClasses}
      data-block-id={block.id}
      data-type={block.type}
      data-checked={block.type === "todo" ? String(!!block.checked) : undefined}
      onDragOver={(event) => onBlockDragOver(event, block.id)}
      onDrop={(event) => {
        void onBlockDrop(event, block.id);
      }}
    >
      <div className="block-gutter">
        <Button
          variant="ghost"
          size="icon"
          className="gutter-btn block-handle-btn"
          data-block-menu-trigger={block.id}
          title="Open block menu"
          draggable
          onDragStart={(event) => {
            closeBlockMenu();
            onBlockDragStart(event, block.id);
          }}
          onDragEnd={onBlockDragEnd}
          onClick={openBlockMenu}
        >
          <span className="block-handle-dots" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
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
        className={`block-body${block.backgroundColor ? " block-body-highlighted" : ""}`}
        contentEditable={block.type !== "divider"}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-number={
          block.type === "numbered_list" ? String(numberedCounter) : undefined
        }
        style={{
          color: normalizeBlockColor(block.color),
          backgroundColor: block.backgroundColor ?? undefined,
        }}
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

      {menuPosition ? (
        <div
          className="block-context-menu"
          data-block-menu-id={block.id}
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <div className="block-context-label">
            {getBlockTypeConfig(block.type).label}
          </div>

          <button
            className="block-context-item"
            onMouseEnter={() => setSubmenu("turn-into")}
          >
            <span>Turn into</span>
            <span className="block-context-chevron">&gt;</span>
          </button>

          <button
            className="block-context-item"
            onMouseEnter={() => setSubmenu("color")}
          >
            <span>Color</span>
            <span className="block-context-chevron">&gt;</span>
          </button>

          <div className="block-context-divider" />

          <button className="block-context-item" onClick={copyLinkToBlock}>
            <span>Copy link to block</span>
            <span className="block-context-shortcut">Cmd+Shift+L</span>
          </button>

          <button
            className="block-context-item"
            onClick={() => {
              duplicateBlock(block.id)
                .then(() => closeBlockMenu())
                .catch((error) => {
                  showErrorToast(error, "Failed to duplicate block");
                });
            }}
          >
            <span>Duplicate</span>
            <span className="block-context-shortcut">Cmd+D</span>
          </button>

          <button
            className="block-context-item"
            onMouseEnter={() => setSubmenu("move-to")}
          >
            <span>Move to</span>
            <span className="block-context-chevron">&gt;</span>
          </button>

          <button
            className="block-context-item block-context-item-danger"
            onClick={() => {
              deleteBlock(block.id)
                .then(() => closeBlockMenu())
                .catch((error) => {
                  showErrorToast(error, "Failed to delete block");
                });
            }}
          >
            <span>Delete</span>
            <span className="block-context-shortcut">Del</span>
          </button>

          <button
            className="block-context-item"
            onClick={() => {
              showToast("Comments are coming soon");
              closeBlockMenu();
            }}
          >
            <span>Comment</span>
          </button>

          <div className="block-context-divider" />
          <div className="block-context-meta">
            <div>Last edited by {auth?.displayName ?? "Unknown"}</div>
            <div>{formattedUpdatedAt}</div>
          </div>

          {submenu === "turn-into" ? (
            <div className="block-context-submenu">
              {BLOCK_TYPES.map((entry) => (
                <button
                  key={entry.type}
                  className="block-context-item"
                  onClick={() => {
                    updateBlock(block.id, { type: entry.type }).catch(
                      (error) => {
                        showErrorToast(error, "Failed to update block type");
                      },
                    );
                    closeBlockMenu();
                    focusBlock(block.id);
                  }}
                >
                  <span>{entry.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {submenu === "color" ? (
            <div className="block-context-submenu block-context-submenu-wide">
              <div className="block-context-subtitle">Text</div>
              {TEXT_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={`text-${swatch.label}`}
                  className="block-context-item"
                  onClick={() => {
                    updateBlock(block.id, { color: swatch.value }).catch(
                      (error) => {
                        showErrorToast(error, "Failed to update block color");
                      },
                    );
                    closeBlockMenu();
                  }}
                >
                  <span>{swatch.label}</span>
                </button>
              ))}

              <div className="block-context-subtitle">Background</div>
              {BG_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={`bg-${swatch.label}`}
                  className="block-context-item"
                  onClick={() => {
                    updateBlock(block.id, {
                      backgroundColor: swatch.value,
                    }).catch((error) => {
                      showErrorToast(
                        error,
                        "Failed to update block background",
                      );
                    });
                    closeBlockMenu();
                  }}
                >
                  <span>{swatch.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {submenu === "move-to" ? (
            <div className="block-context-submenu">
              <button
                className="block-context-item"
                onClick={() => {
                  void moveWithinSiblings("up").catch((error) => {
                    showErrorToast(error, "Failed to move block");
                  });
                }}
              >
                <span>Move up</span>
              </button>
              <button
                className="block-context-item"
                onClick={() => {
                  void moveWithinSiblings("down").catch((error) => {
                    showErrorToast(error, "Failed to move block");
                  });
                }}
              >
                <span>Move down</span>
              </button>
              <button
                className="block-context-item"
                onClick={() => {
                  void moveWithinSiblings("top").catch((error) => {
                    showErrorToast(error, "Failed to move block");
                  });
                }}
              >
                <span>Move to top</span>
              </button>
              <button
                className="block-context-item"
                onClick={() => {
                  void moveWithinSiblings("bottom").catch((error) => {
                    showErrorToast(error, "Failed to move block");
                  });
                }}
              >
                <span>Move to bottom</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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
  const moveBlock = useAppStore((state) => state.moveBlock);

  useRemotePresenceRenderer();

  const [title, setTitle] = useState(currentPage?.title ?? "");
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint>(null);
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

  const clearDragState = () => {
    setDraggingBlockId(null);
    setDropHint(null);
  };

  const resolveAfterBlockId = (
    rootIds: string[],
    draggingId: string,
    targetId: string,
    position: "before" | "after",
  ): string | null => {
    const withoutDragging = rootIds.filter((id) => id !== draggingId);
    if (position === "after") {
      return targetId;
    }

    const targetIndex = withoutDragging.indexOf(targetId);
    if (targetIndex <= 0) return null;
    return withoutDragging[targetIndex - 1] ?? null;
  };

  const onBlockDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    setDraggingBlockId(blockId);
    setDropHint(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", blockId);
  };

  const onBlockDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    blockId: string,
  ) => {
    if (!draggingBlockId || draggingBlockId === blockId) return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const position =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";

    setDropHint((current) => {
      if (current?.blockId === blockId && current.position === position) {
        return current;
      }
      return { blockId, position };
    });
    event.dataTransfer.dropEffect = "move";
  };

  const onBlockDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    targetBlockId: string,
  ) => {
    event.preventDefault();
    if (!currentPage || !draggingBlockId || draggingBlockId === targetBlockId) {
      clearDragState();
      return;
    }

    const hintPosition =
      dropHint?.blockId === targetBlockId ? dropHint.position : "after";
    const afterBlockId = resolveAfterBlockId(
      currentPage.rootBlockIds,
      draggingBlockId,
      targetBlockId,
      hintPosition,
    );

    try {
      await moveBlock(draggingBlockId, null, afterBlockId);
    } catch (error) {
      showErrorToast(error, "Failed to move block");
    } finally {
      clearDragState();
    }
  };

  const onTailDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingBlockId) return;
    event.preventDefault();
    setDropHint({ blockId: "__tail__", position: "after" });
    event.dataTransfer.dropEffect = "move";
  };

  const onTailDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!currentPage || !draggingBlockId) {
      clearDragState();
      return;
    }

    const withoutDragging = currentPage.rootBlockIds.filter(
      (id) => id !== draggingBlockId,
    );
    const afterBlockId = withoutDragging.at(-1) ?? null;

    try {
      await moveBlock(draggingBlockId, null, afterBlockId);
    } catch (error) {
      showErrorToast(error, "Failed to move block");
    } finally {
      clearDragState();
    }
  };

  return (
    <main className="page-pane">
      <article>
        <header className="page-header">
          <div className="presence">
            {others.map((entry) => (
              <span
                key={entry.userId}
                className="avatar presence-avatar"
                style={{ "--avatar-color": entry.color } as React.CSSProperties}
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
              <BlockRow
                key={block.id}
                block={block}
                numberedCounter={number}
                draggingBlockId={draggingBlockId}
                dropHint={dropHint}
                onBlockDragStart={onBlockDragStart}
                onBlockDragOver={onBlockDragOver}
                onBlockDrop={onBlockDrop}
                onBlockDragEnd={clearDragState}
              />
            );
          })}

          {draggingBlockId ? (
            <div
              className={`blocks-drop-tail${dropHint?.blockId === "__tail__" ? " is-target" : ""}`}
              onDragOver={onTailDragOver}
              onDrop={(event) => {
                void onTailDrop(event);
              }}
            >
              Drop at bottom
            </div>
          ) : null}
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
