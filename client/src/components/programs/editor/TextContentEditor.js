import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '../../ui/label.tsx';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { toast } from 'react-hot-toast';
import { uploadFile } from '../../../services/uploadService';

const Font = Quill.import('formats/font');
Font.whitelist = ['sans-serif', 'serif', 'monospace'];
Quill.register(Font, true);

const TextContentEditor = ({ lesson, setLesson }) => {
  const { t } = useTranslation(['programs', 'common']);
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const updateTimeout = useRef(null);
  const isExternalUpdate = useRef(false);

  useEffect(() => {
    if (quillRef.current || !editorRef.current) return;

    const handleImageUpload = () => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');
      input.click();

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        const quill = quillRef.current;
        const range = quill.getSelection(true);
        quill.enable(false);

        const uploadToast = toast.loading(t('common:uploading_image'));

        try {
          const result = await uploadFile(file);
          if (result?.url) {
            quill.insertEmbed(range.index, 'image', result.url);
            quill.setSelection(range.index + 1);
            toast.success(t('common:image_upload_success'), { id: uploadToast });
          } else {
            throw new Error('Upload failed or returned invalid data');
          }
        } catch (error) {
          toast.error(t('common:image_upload_error'), { id: uploadToast });
        } finally {
          quill.enable(true);
          quill.focus();
        }
      };
    };

    const toolbarOptions = [
      [{ 'font': Font.whitelist }, { 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      ['blockquote', 'code-block'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'indent': '-1' }, { 'indent': '+1' }],
      ['link', 'image'],
      ['clean'],
    ];

    quillRef.current = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: t('programs:field_text_content_placeholder'),
      modules: {
        toolbar: {
          container: toolbarOptions,
          handlers: { image: handleImageUpload },
        },
      },
    });

    quillRef.current.on('text-change', (delta, oldDelta, source) => {
      if (source === 'user' && !isExternalUpdate.current) {
        if (updateTimeout.current) clearTimeout(updateTimeout.current);
        
        updateTimeout.current = setTimeout(() => {
          const html = quillRef.current.root.innerHTML;
          const cleanHtml = html === '<p><br></p>' ? '' : html;
          setLesson((prev) => ({
            ...prev,
            content: { ...prev.content, text: cleanHtml },
          }));
        }, 500);
      }
    });
    
    return () => {
        if (updateTimeout.current) {
            clearTimeout(updateTimeout.current);
        }
    };
  }, [setLesson, t]);

  useEffect(() => {
    if (quillRef.current) {
      const editorHtml = quillRef.current.root.innerHTML;
      const lessonText = lesson.content?.text || '';
      const normalizedEditorHtml = editorHtml === '<p><br></p>' ? '' : editorHtml;

      if (normalizedEditorHtml !== lessonText) {
        isExternalUpdate.current = true;
        const selection = quillRef.current.getSelection();
        if (lessonText) {
          quillRef.current.clipboard.dangerouslyPasteHTML(lessonText);
        } else {
          quillRef.current.setContents([]);
        }
        
        if (selection) {
            try {
               quillRef.current.setSelection(selection);
            } catch (e) {
                // Fails if selection is out of bounds, which can happen. Safe to ignore.
            }
        }

        setTimeout(() => { isExternalUpdate.current = false; }, 0);
      }
    }
  }, [lesson.content?.text]);

  return (
    <div className="space-y-2">
      <Label htmlFor="text-editor">{t('programs:field_text_content')}</Label>
      {/* This container provides the themed border and focus state */}
      <div className="mt-2 rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-background [&_.ql-container]:min-h-[250px] [&_.ql-toolbar]:rounded-t-md [&_.ql-toolbar]:border-b [&_.ql-editor]:text-base">
        <div id="text-editor" ref={editorRef} />
      </div>
    </div>
  );
};

export default TextContentEditor;