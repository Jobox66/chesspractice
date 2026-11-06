import React, { useRef, useState } from 'react';
import { XIcon, UploadIcon, CheckCircle2, CloudAlertIcon, Check, Plus } from 'lucide-react';
import { useTrainerStore } from '../../store/state';
import { chapterFromImport, chapterFromPgn } from '../../util/io';
import { OPENING_LIBRARY, type LibraryEntry } from '../../data/openingLibrary';
import { useAuthStore } from '../../store/auth';
import './modals.css';
import './AddToRepertoireModal.css';
// import { importJSON } from '../../util/importJSON'; // <- assume this exists

type ImportTab = 'library' | 'pgn' | 'json';

const AddToRepertoireModal: React.FC = () => {
  const setShowModal = useTrainerStore((s) => s.setShowingAddToRepertoireMenu);
  const addNewChapter = useTrainerStore((s) => s.addNewChapter);

  const [tab, setTab] = useState<ImportTab>('library');

  // Library: a chapter counts as added when one with the same name is already
  // in the repertoire, so renaming it frees the entry to be added again.
  const repertoire = useTrainerStore((s) => s.repertoire);
  const addedNames = new Set(repertoire.map((c) => c.name));
  const [addingLibrary, setAddingLibrary] = useState(false);
  const pendingLibrary = OPENING_LIBRARY.filter((e) => !addedNames.has(e.name));

  // PGN refs/state
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | undefined>(undefined);
  const nameRef = useRef<HTMLInputElement>(null);
  const pgnRef = useRef<HTMLTextAreaElement>(null);

  // JSON refs/state
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState<string>(''); // stored but never displayed
  const [jsonFilename, setJsonFilename] = useState<string>('');
  const [jsonLoaded, setJsonLoaded] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isImportingJson, setIsImportingJson] = useState(false);

  // Whether this chapter will be saved locally or to the server
  const isLoggedIn = useAuthStore().isAuthenticated();
  const openLogin = useAuthStore((s) => s.openLogin);

  const SignedOutNotice = () => (
    <div className="add-rep-signed-out">
      <CloudAlertIcon />
      <p>
        You're using chesspractice signed out.{' '}
        <button type="button" onClick={openLogin}>
          Log in
        </button>{' '}
        to save your repertoire to the cloud and train anywhere.
      </p>
    </div>
  );

  const resetJsonState = () => {
    setJsonText('');
    setJsonFilename('');
    setJsonLoaded(false);
    setJsonError(null);
    if (jsonFileRef.current) jsonFileRef.current.value = '';
  };

  const addLibraryEntries = async (entries: LibraryEntry[]) => {
    setAddingLibrary(true);
    // White chapters are prepended to the repertoire and black ones appended,
    // so add the white ones back to front to keep the library's order.
    const ordered = [
      ...entries.filter((e) => e.trainAs === 'white').reverse(),
      ...entries.filter((e) => e.trainAs === 'black'),
    ];
    try {
      for (const entry of ordered) {
        const chapter = chapterFromPgn(entry.pgn, entry.trainAs, entry.name);
        if (chapter) await addNewChapter(chapter);
      }
    } finally {
      setAddingLibrary(false);
    }
  };

  const handleSubmitPgn = (e: React.FormEvent) => {
    e.preventDefault();

    const name = nameRef.current?.value || '';
    const pgn = pgnRef.current?.value || '';
    const color = selectedColor || 'white';

    const chapter = chapterFromPgn(pgn, color, name);
    // chapterFromPgn alerts and returns null on a parse error; keep the
    // modal open so the user can fix the PGN rather than silently closing.
    if (!chapter) return;
    addNewChapter(chapter);
    setShowModal(false);
  };

  const handlePgnFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (pgnRef.current) pgnRef.current.value = String(reader.result ?? '');
    };
    reader.readAsText(file);
  };

  //TODO dont need all this
  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // basic UX: ensure it "looks like" json
    const isJson = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
    if (!isJson) {
      setJsonError('Please choose a .json file.');
      setJsonLoaded(false);
      setJsonText('');
      setJsonFilename('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '').trim();
      setJsonError(null);
      setJsonFilename(file.name);

      // validate parse now so user gets immediate feedback
      try {
        JSON.parse(text);
        setJsonText(text);
        setJsonLoaded(true);
      } catch {
        setJsonText('');
        setJsonLoaded(false);
        setJsonError('That file is not valid JSON.');
      }
    };
    reader.onerror = () => {
      setJsonText('');
      setJsonLoaded(false);
      setJsonFilename('');
      setJsonError('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleImportJson = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = jsonText.trim();
    if (!trimmed) {
      setJsonError('Choose a .json file first.');
      return;
    }

    setJsonError(null);
    setIsImportingJson(true);

    try {
      // assume this restores repertoire / chapters internally
      // (or returns chapters that you add—either way, you said it exists)
      const parsed = JSON.parse(trimmed);
      console.log('Chapters', parsed);

      console.log('pars', parsed.chapters);
      for (const chapter of parsed.chapters) {
        // Assign a fresh uuid so imported chapters never collide with
        // existing ones (exports strip the uuid).
        await addNewChapter(chapterFromImport(chapter));
      }
      resetJsonState();
      setShowModal(false);
    } catch (err: any) {
      setJsonError(err?.message ?? 'Failed to import JSON backup.');
    } finally {
      setIsImportingJson(false);
    }
  };
  return (
    <dialog open className="modal-dialog modal-dialog-lg add-rep-dialog">
      {/* Close button */}
      <button
        className="modal-close-puck"
        aria-label="Close"
        onClick={() => {
          resetJsonState();
          setShowModal(false);
        }}
        type="button"
      >
        <XIcon />
      </button>

      {/* Heading + Tabs */}
      <div className="add-rep-head">
        <h2>Add to Repertoire</h2>

        <div className="add-rep-tabs">
          <button
            type="button"
            onClick={() => setTab('library')}
            className={`add-rep-tab ${tab === 'library' ? 'is-active' : ''}`}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setTab('pgn')}
            className={`add-rep-tab ${tab === 'pgn' ? 'is-active' : ''}`}
          >
            PGN
          </button>
          <button
            type="button"
            onClick={() => setTab('json')}
            className={`add-rep-tab ${tab === 'json' ? 'is-active' : ''}`}
          >
            JSON
          </button>
        </div>
      </div>

      {/* Body — scrolls under the head, with the submit pinned below it so the
          primary action stays reachable on short viewports. */}
      {tab === 'library' ? (
        <div className="add-rep-form">
          <div className="add-rep-body">
            <p className="add-rep-json-intro">
              Ready-made opening chapters, annotated in Vietnamese. Each chapter is a tree: you
              learn your own moves, and the branches are the opponent's common replies.
            </p>
            {(['white', 'black'] as const).map((color) => (
              <section key={color} className="add-rep-lib-group">
                <h3 className="add-rep-lib-heading">{color === 'white' ? 'As White' : 'As Black'}</h3>
                <ul className="add-rep-lib-list">
                  {OPENING_LIBRARY.filter((e) => e.trainAs === color).map((entry) => {
                    const added = addedNames.has(entry.name);
                    return (
                      <li key={entry.id} className="add-rep-lib-item">
                        <div className="add-rep-lib-text">
                          <span className="add-rep-lib-name">{entry.name}</span>
                          <span className="add-rep-lib-desc">{entry.description}</span>
                        </div>
                        <button
                          type="button"
                          className={`add-rep-lib-add ${added ? 'is-added' : ''}`}
                          disabled={added || addingLibrary}
                          onClick={() => addLibraryEntries([entry])}
                        >
                          {added ? <Check /> : <Plus />}
                          <span>{added ? 'Added' : 'Add'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {!isLoggedIn && <SignedOutNotice />}
          </div>

          <div className="add-rep-footer">
            <button
              type="button"
              className="add-rep-submit"
              disabled={addingLibrary || pendingLibrary.length === 0}
              onClick={() => addLibraryEntries(pendingLibrary)}
            >
              {pendingLibrary.length === 0
                ? 'All library chapters added'
                : `Add all (${pendingLibrary.length})`}
            </button>
          </div>
        </div>
      ) : tab === 'pgn' ? (
        <form onSubmit={handleSubmitPgn} className="add-rep-form">
          <div className="add-rep-body">
            {/* Name */}
            <div className="add-rep-field">
              <label>Name</label>
              <input id="name" ref={nameRef} className="add-rep-name-input" />
            </div>

            {/* PGN */}
            <div className="add-rep-field">
              <label>PGN</label>
              <textarea
                id="pgn"
                ref={pgnRef}
                rows={4}
                placeholder={'Enter PGN...\nex. 1. d4 d5 2. c4 c6'}
                className="add-rep-pgn-input"
              />
              <input
                id="fileInput"
                type="file"
                accept=".txt,.pgn"
                onChange={handlePgnFileChange}
                className="add-rep-file-input"
              />
            </div>

            {/* Train As */}
            <div className="add-rep-train-as">
              <label>Train as</label>
              <div className="add-rep-colors">
                <label className="add-rep-color">
                  <input
                    id="colorWhite"
                    type="radio"
                    name="color"
                    value="white"
                    onChange={() => setSelectedColor('white')}
                  />
                  <span className="add-rep-color-label">White</span>
                </label>
                <label className="add-rep-color">
                  <input
                    id="colorBlack"
                    type="radio"
                    name="color"
                    value="black"
                    onChange={() => setSelectedColor('black')}
                  />
                  <span className="add-rep-color-label">Black</span>
                </label>
              </div>
            </div>
            {!isLoggedIn && <SignedOutNotice />}
          </div>

          <div className="add-rep-footer">
            <button type="submit" disabled={!selectedColor} className="add-rep-submit">
              Add to repertoire
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleImportJson} className="add-rep-form">
          <div className="add-rep-body">
            <p className="add-rep-json-intro">
              Import a JSON file of a repertoire or chapter that you've previously downloaded.{' '}
            </p>

            <div className="add-rep-field">
              <label>File (.json)</label>
              <input
                ref={jsonFileRef}
                type="file"
                accept="application/json,.json"
                onChange={handleJsonFileChange}
                className="add-rep-file-input"
              />

              {/* Loaded indicator (no content preview) */}
              <div className="add-rep-json-status">
                {jsonLoaded ? (
                  <div className="add-rep-json-loaded">
                    <CheckCircle2 />
                    <strong>Loaded</strong>
                    {jsonFilename ? (
                      <span className="add-rep-json-filename">— {jsonFilename}</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="add-rep-json-idle">No file loaded yet.</div>
                )}
              </div>
            </div>

            {jsonError ? <div className="add-rep-json-error">{jsonError}</div> : null}
            {!isLoggedIn && <SignedOutNotice />}
          </div>

          <div className="add-rep-footer">
            <div className="add-rep-json-actions">
              <button type="button" onClick={resetJsonState} className="add-rep-clear-btn">
                Clear
              </button>

              <button
                type="submit"
                disabled={isImportingJson || !jsonLoaded}
                className="add-rep-import-btn"
              >
                <span>
                  <UploadIcon />
                  {isImportingJson ? 'Importing...' : 'Import'}
                </span>
              </button>
            </div>
          </div>
        </form>
      )}
    </dialog>
  );
};
export default AddToRepertoireModal;
