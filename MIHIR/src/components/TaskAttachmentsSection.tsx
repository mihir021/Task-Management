import React, { useRef, useState } from 'react';
import {
  Upload,
  ZoomIn,
  ZoomOut,
  X,
  Trash2,
  Edit3,
  Columns2,
  ClipboardPaste,
  Check,
  Image as ImageIcon,
} from 'lucide-react';
import {
  AttachmentCategory,
  TaskAttachment,
  TaskFileChange,
  TaskRecord,
  TaskTestRecord,
} from '../types/workspace';
import { formatUnambiguousDate } from '../lib/workspaceLogic';

interface TaskAttachmentsSectionProps {
  task: TaskRecord;
  timezone: string;
  maxSizeMB: number;
  onUploadAttachment: (payload: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    base64Data: string;
    category: AttachmentCategory;
    caption: string;
    notes: string;
    linkedFileChangeId: string | null;
    linkedTestId: string | null;
  }) => Promise<void>;
  onUpdateAttachment: (
    attId: string,
    payload: Partial<TaskAttachment>
  ) => Promise<void>;
  onDeleteAttachment: (attId: string) => Promise<void>;
}

const CATEGORIES: AttachmentCategory[] = ['Before', 'After', 'Reference', 'Testing'];

export const TaskAttachmentsSection: React.FC<TaskAttachmentsSectionProps> = ({
  task,
  timezone,
  maxSizeMB,
  onUploadAttachment,
  onUpdateAttachment,
  onDeleteAttachment,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadCategory, setUploadCategory] = useState<AttachmentCategory>('After');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [linkedFileId, setLinkedFileId] = useState<string>('');
  const [linkedTestId, setLinkedTestId] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<AttachmentCategory | 'All'>('All');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Full-size Zoom Preview Modal state
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  // Before / After Comparison state
  const beforeAttachments = task.attachments.filter((a) => a.category === 'Before');
  const afterAttachments = task.attachments.filter((a) => a.category === 'After');
  const [compareBeforeId, setCompareBeforeId] = useState<string>(beforeAttachments[0]?.id || '');
  const [compareAfterId, setCompareAfterId] = useState<string>(afterAttachments[0]?.id || '');
  const [compareMode, setCompareMode] = useState<'side-by-side' | 'slider'>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [showCompareStudio, setShowCompareStudio] = useState<boolean>(
    beforeAttachments.length > 0 && afterAttachments.length > 0
  );

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCategory, setEditCategory] = useState<AttachmentCategory>('After');
  const [editFileName, setEditFileName] = useState('');

  const processFile = async (file: File) => {
    setUploadError('');
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`File "${file.name}" exceeds the ${maxSizeMB} MB attachment limit.`);
      return;
    }

    const allowed = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
      'text/plain',
      'application/json',
    ];
    if (file.type && !allowed.includes(file.type)) {
      setUploadError(`Unsupported format "${file.type}". Please upload PNG, JPEG, WebP, GIF, SVG, PDF, TXT, or JSON.`);
      return;
    }

    setUploading(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      await onUploadAttachment({
        originalName: file.name,
        mimeType: file.type || 'image/png',
        sizeBytes: file.size,
        base64Data,
        category: uploadCategory,
        caption: uploadCaption.trim() || file.name,
        notes: uploadNotes.trim(),
        linkedFileChangeId: linkedFileId || null,
        linkedTestId: linkedTestId || null,
      });

      setUploadCaption('');
      setUploadNotes('');
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFile(files[0]);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const namedFile = new File([blob], `clipboard-screenshot-${Date.now()}.png`, {
            type: blob.type || 'image/png',
          });
          await processFile(namedFile);
          return;
        }
      }
    }
  };

  const filteredAttachments = task.attachments.filter(
    (a) => filterCategory === 'All' || a.category === filterCategory
  );

  const selectedBefore =
    beforeAttachments.find((a) => a.id === compareBeforeId) || beforeAttachments[0] || null;
  const selectedAfter =
    afterAttachments.find((a) => a.id === compareAfterId) || afterAttachments[0] || null;

  return (
    <div className="space-y-6" onPaste={handlePaste}>
      {/* Upload Dropzone & Metadata Form */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Upload Screenshots & Verification Attachments
            </h3>
            <p className="text-xs text-slate-500">
              Files are persisted on disk in <code className="font-mono">MIHIR/uploads/</code>. Supports file picker, drag-and-drop, or pasting from clipboard (<kbd className="font-mono">Ctrl+V</kbd>).
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Max size: {maxSizeMB} MB · PNG, JPG, WebP, SVG, PDF
          </span>
        </div>

        {uploadError && (
          <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {uploadError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="att-category" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Category
            </label>
            <select
              id="att-category"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as AttachmentCategory)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="att-caption" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Screenshot Caption
            </label>
            <input
              id="att-caption"
              type="text"
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              placeholder="e.g., After: WAF Blocked Threat Vectors promoted to y=0"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="att-notes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Context Notes (Optional)
            </label>
            <input
              id="att-notes"
              type="text"
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder="Viewport 1440x900 on branch..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label htmlFor="att-link-file" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Link to Changed File
            </label>
            <select
              id="att-link-file"
              value={linkedFileId}
              onChange={(e) => setLinkedFileId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="">None</option>
              {task.changedFiles.map((f: TaskFileChange) => (
                <option key={f.id} value={f.id}>
                  {f.repositoryName}: {f.filePath}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="att-link-test" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Link to Test Record
            </label>
            <select
              id="att-link-test"
              value={linkedTestId}
              onChange={(e) => setLinkedTestId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="">None</option>
              {task.tests.map((t: TaskTestRecord) => (
                <option key={t.id} value={t.id}>
                  [{t.status}] {t.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`p-6 rounded-xl border-2 border-dashed text-center transition-colors ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading...' : 'Select File to Upload'}
              </button>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <ClipboardPaste className="w-3.5 h-3.5" />
                or drag & drop / paste image here
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Before / After Visual Comparison Studio */}
      {(beforeAttachments.length > 0 || afterAttachments.length > 0) && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Columns2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Before & After Visual Comparison
              </h3>
              <p className="text-xs text-slate-500">
                Compare selected Before and After screenshots side-by-side or with an interactive split slider.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareMode(compareMode === 'side-by-side' ? 'slider' : 'side-by-side')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
              >
                Mode: {compareMode === 'side-by-side' ? 'Side-by-Side' : 'Overlay Slider'}
              </button>
              <button
                type="button"
                onClick={() => setShowCompareStudio(!showCompareStudio)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
              >
                {showCompareStudio ? 'Hide Comparison' : 'Open Comparison'}
              </button>
            </div>
          </div>

          {showCompareStudio && (
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Before Image ({beforeAttachments.length})
                  </label>
                  <select
                    aria-label="Select Before image for comparison"
                    value={selectedBefore?.id || ''}
                    onChange={(e) => setCompareBeforeId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    {beforeAttachments.length === 0 && <option value="">No Before image uploaded</option>}
                    {beforeAttachments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.caption} ({a.originalName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    After Image ({afterAttachments.length})
                  </label>
                  <select
                    aria-label="Select After image for comparison"
                    value={selectedAfter?.id || ''}
                    onChange={(e) => setCompareAfterId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    {afterAttachments.length === 0 && <option value="">No After image uploaded</option>}
                    {afterAttachments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.caption} ({a.originalName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedBefore && selectedAfter ? (
                compareMode === 'side-by-side' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-950 p-2 space-y-2">
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="font-semibold text-amber-400">BEFORE</span>
                        <span className="text-slate-400 truncate max-w-xs">{selectedBefore.caption}</span>
                      </div>
                      <img
                        src={selectedBefore.url}
                        alt={selectedBefore.caption}
                        referrerPolicy="no-referrer"
                        className="w-full h-64 object-contain rounded bg-slate-900"
                      />
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-950 p-2 space-y-2">
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="font-semibold text-emerald-400">AFTER</span>
                        <span className="text-slate-400 truncate max-w-xs">{selectedAfter.caption}</span>
                      </div>
                      <img
                        src={selectedAfter.url}
                        alt={selectedAfter.caption}
                        referrerPolicy="no-referrer"
                        className="w-full h-64 object-contain rounded bg-slate-900"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative w-full h-80 rounded-lg overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 select-none">
                      <img
                        src={selectedAfter.url}
                        alt={selectedAfter.caption}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                      <div
                        className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-indigo-500 bg-slate-950"
                        style={{ width: `${sliderPosition}%` }}
                      >
                        <img
                          src={selectedBefore.url}
                          alt={selectedBefore.caption}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-slate-900/80 text-[11px] font-mono text-amber-400">
                        BEFORE
                      </div>
                      <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-slate-900/80 text-[11px] font-mono text-emerald-400">
                        AFTER
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label htmlFor="compare-slider-range" className="text-xs font-mono text-slate-500">
                        Comparison Split ({sliderPosition}%):
                      </label>
                      <input
                        id="compare-slider-range"
                        type="range"
                        min={5}
                        max={95}
                        value={sliderPosition}
                        onChange={(e) => setSliderPosition(Number(e.target.value))}
                        className="flex-1"
                      />
                    </div>
                  </div>
                )
              ) : (
                <p className="text-xs text-slate-500">
                  Upload at least one "Before" and one "After" screenshot to compare them side by side.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Thumbnail Gallery */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Attachment Gallery ({filteredAttachments.length})
          </h3>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(['All', ...CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterCategory === cat
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredAttachments.length === 0 ? (
          <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
            No screenshots or attachments in this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAttachments.map((att) => {
              const linkedFile = task.changedFiles.find((f) => f.id === att.linkedFileChangeId);
              const linkedTest = task.tests.find((t) => t.id === att.linkedTestId);
              const isImage = att.mimeType.startsWith('image/');

              return (
                <div
                  key={att.id}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
                >
                  <div className="relative bg-slate-950 h-48 flex items-center justify-center overflow-hidden group">
                    {isImage ? (
                      <img
                        src={att.url}
                        alt={att.caption}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={() => {
                          setPreviewAttachment(att);
                          setZoomPercent(100);
                        }}
                      />
                    ) : (
                      <div className="text-slate-400 flex flex-col items-center gap-2">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-xs font-mono">{att.originalName}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewAttachment(att);
                        setZoomPercent(100);
                      }}
                      aria-label={`Preview ${att.caption} full size`}
                      className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-md bg-slate-900/85 text-white text-xs flex items-center gap-1 hover:bg-indigo-600 transition-colors"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      Full Preview
                    </button>
                  </div>

                  <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                    {editingId === att.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as AttachmentCategory)}
                            className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editFileName}
                            onChange={(e) => setEditFileName(e.target.value)}
                            placeholder="Filename"
                            className="px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                        </div>
                        <input
                          type="text"
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          placeholder="Caption"
                          className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes"
                          className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 text-xs text-slate-500"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await onUpdateAttachment(att.id, {
                                category: editCategory,
                                caption: editCaption,
                                notes: editNotes,
                                originalName: editFileName,
                              });
                              setEditingId(null);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded"
                          >
                            <Check className="w-3 h-3" />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                              {att.category.toUpperCase()}
                            </span>
                            <span>
                              {(att.sizeBytes / 1024).toFixed(1)} KB ·{' '}
                              {formatUnambiguousDate(att.uploadedAt, timezone, false)}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {att.caption}
                          </div>
                          {att.notes && (
                            <p className="text-xs text-slate-600 dark:text-slate-400">{att.notes}</p>
                          )}
                          {(linkedFile || linkedTest) && (
                            <div className="pt-1 text-[11px] font-mono text-slate-500 space-y-0.5">
                              {linkedFile && <div>Linked File: {linkedFile.filePath}</div>}
                              {linkedTest && <div>Linked Test: {linkedTest.title}</div>}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <span className="font-mono text-slate-400 truncate max-w-[180px]">
                            {att.originalName}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(att.id);
                                setEditCategory(att.category);
                                setEditCaption(att.caption);
                                setEditNotes(att.notes);
                                setEditFileName(att.originalName);
                              }}
                              aria-label={`Edit ${att.caption}`}
                              className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteAttachment(att.id)}
                              aria-label={`Delete ${att.caption}`}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full-Size Zoom Preview Modal */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Full size screenshot preview"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 text-slate-200">
              <div className="truncate">
                <span className="text-xs font-mono text-indigo-400 mr-2">
                  [{previewAttachment.category}]
                </span>
                <span className="text-sm font-semibold">{previewAttachment.caption}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setZoomPercent(Math.max(50, zoomPercent - 25))}
                  aria-label="Zoom out"
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono w-12 text-center tabular-nums">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomPercent(Math.min(250, zoomPercent + 25))}
                  aria-label="Zoom in"
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  aria-label="Close image preview"
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-950">
              <img
                src={previewAttachment.url}
                alt={previewAttachment.caption}
                referrerPolicy="no-referrer"
                style={{ width: `${zoomPercent}%`, maxWidth: 'none' }}
                className="rounded shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
