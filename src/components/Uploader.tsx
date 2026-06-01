'use client';

import { useRef, useState } from 'react';
import { LocalRepoPicker } from './LocalRepoPicker';

interface Props {
  onSubmit: (formData: FormData) => void;
  disabled?: boolean;
}

const MODELS = [
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (recommended)' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7 (deep review)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (fast)' },
];

export function Uploader({ onSubmit, disabled }: Props) {
  const [paste, setPaste] = useState('');
  const [pasteFilename, setPasteFilename] = useState('Snippet.cls');
  const [model, setModel] = useState('claude-sonnet-4-5');
  const [fileList, setFileList] = useState<File[]>([]);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [selectedRepoFiles, setSelectedRepoFiles] = useState<string[]>([]);
  const [browsedFiles, setBrowsedFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set('model', model);
    if (paste.trim()) {
      fd.set('paste', paste);
      fd.set('pasteFilename', pasteFilename);
    }
    for (const f of fileList) fd.append('files', f);

    // Path mode (server reads files from disk)
    if (repoPath && selectedRepoFiles.length > 0) {
      fd.set('repoPath', repoPath);
      fd.set('repoFiles', JSON.stringify(selectedRepoFiles));
    }

    // Browse mode (browser uploads File objects; preserve relative paths in the form-data filename)
    if (browsedFiles.length > 0 && selectedRepoFiles.length > 0) {
      const selectedSet = new Set(selectedRepoFiles);
      for (const f of browsedFiles) {
        if (selectedSet.has(f.webkitRelativePath)) {
          fd.append('files', f, f.webkitRelativePath);
        }
      }
    }

    onSubmit(fd);
  }

  const hasInput =
    paste.trim().length > 0 || fileList.length > 0 || selectedRepoFiles.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-900/60"
    >
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600 dark:text-slate-400">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Paste code</label>
          <input
            value={pasteFilename}
            onChange={(e) => setPasteFilename(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            placeholder="filename (e.g. AccountTrigger.trigger)"
          />
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="public class AccountService { ... }"
          rows={10}
          className="w-full rounded border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Or upload files (.cls, .trigger, .js, .html, .xml, .zip)
        </label>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".cls,.trigger,.js,.html,.xml,.zip"
          onChange={(e) => setFileList(Array.from(e.target.files ?? []))}
          className="text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-sky-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-sky-600 dark:text-slate-400"
        />
        {fileList.length > 0 && (
          <ul className="text-xs text-slate-600 dark:text-slate-400">
            {fileList.map((f) => (
              <li key={f.name}>
                • {f.name} ({Math.round(f.size / 1024)} KB)
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Or connect a local repository
        </label>
        <p className="text-[11px] text-slate-500">
          Paste a path and click <strong>Connect</strong>, or click <strong>Browse…</strong> to pick a folder with
          the OS file dialog. The tree shows only reviewable files (.cls, .trigger, .js, .html, .xml). Folder
          checkboxes select all files inside.
        </p>
        <LocalRepoPicker
          repoPath={repoPath}
          onRepoPathChange={setRepoPath}
          browsedFiles={browsedFiles}
          onBrowsedFilesChange={setBrowsedFiles}
          selectedFiles={selectedRepoFiles}
          onSelectedFilesChange={setSelectedRepoFiles}
        />
      </div>

      <button
        type="submit"
        disabled={disabled || !hasInput}
        className="self-start rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? 'Reviewing…' : 'Run review'}
      </button>
    </form>
  );
}