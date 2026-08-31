import React, { useReducer, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// TipTap wrapper for the admin email composer. Kept in its own module so the
// TipTap bundle only lands in the lazy-loaded AdminEmail chunk.
//
// The toolbar deliberately offers only what the backend sanitizer allowlist
// keeps (see backend email_campaign_service.CAMPAIGN_ALLOWED_TAGS): no images,
// no colors, no H1 (the email template's header owns that level).

// Tailwind arbitrary variants styling the ProseMirror content area — the repo
// has no typography plugin. Split into light base + dark additions so the
// read-only email preview (which sits on a white "email" card even in dark
// mode) can opt out of the dark variants via forceLight.
const CONTENT_CLASSES_LIGHT = [
  '[&_.ProseMirror]:min-h-[240px]',
  '[&_.ProseMirror]:px-4',
  '[&_.ProseMirror]:py-3',
  '[&_.ProseMirror]:outline-none',
  '[&_.ProseMirror]:text-gray-900',
  '[&_p]:my-2',
  '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2',
  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-2',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2',
  '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:my-2 [&_blockquote]:text-gray-600',
  '[&_a]:text-primary-600 [&_a]:underline',
  '[&_hr]:my-4 [&_hr]:border-gray-300',
  '[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm',
  '[&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded [&_pre]:my-2 [&_pre]:overflow-x-auto',
].join(' ');

const CONTENT_CLASSES_DARK = [
  'dark:[&_.ProseMirror]:text-white',
  'dark:[&_blockquote]:border-gray-600 dark:[&_blockquote]:text-gray-400',
  'dark:[&_hr]:border-gray-600',
  'dark:[&_code]:bg-gray-700',
  'dark:[&_pre]:bg-gray-700',
].join(' ');

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium min-w-[32px] transition-colors ${
        active
          ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1 self-center" />;
}

export default function RichTextEditor({ content, onChange, readOnly = false, forceLight = false }) {
  // TipTap v3 optimizes re-renders away from the host component; bump local
  // state on every transaction so toolbar active states stay in sync.
  const [, bumpRender] = useReducer((x) => x + 1, 0);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          protocols: ['http', 'https', 'mailto'],
        },
      }),
    ],
    content: content || '',
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (onChange) onChange(ed.getHTML());
    },
    onTransaction: () => bumpRender(),
  });

  const openLinkInput = useCallback(() => {
    if (!editor) return;
    setLinkUrl(editor.getAttributes('link').href || '');
    setShowLinkInput(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  if (!editor) return null;

  const contentClasses = forceLight
    ? CONTENT_CLASSES_LIGHT
    : `${CONTENT_CLASSES_LIGHT} ${CONTENT_CLASSES_DARK}`;

  if (readOnly) {
    return (
      <div className={`${contentClasses} [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0`}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline"
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <span className="line-through">S</span>
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Subheading"
        >
          H3
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          &bull; List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Quote"
        >
          &ldquo;&rdquo;
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={openLinkInput}
          active={editor.isActive('link')}
          title="Add or edit link"
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive('link')}
          title="Remove link"
        >
          Unlink
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          &mdash;
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          &#8630;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          &#8631;
        </ToolbarButton>
      </div>

      {/* Link input row */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
              }
            }}
            placeholder="https://..."
            autoFocus
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button
            type="button"
            onClick={applyLink}
            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => setShowLinkInput(false)}
            className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Content */}
      <div className={contentClasses}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
