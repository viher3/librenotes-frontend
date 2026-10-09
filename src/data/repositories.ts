import type {
  Attachment,
  AttachmentDetail,
  Destination,
  CreateLinkInput,
  CreateNoteInput,
  Folder,
  FolderContents,
  ID,
  Link,
  ListLinksParams,
  ListNotesParams,
  Note,
  NoteChildren,
  NoteSummary,
  Page,
  SearchParams,
  SearchResult,
  SignUpInput,
  TagCount,
  Trash,
  TrashKind,
  UpdateLinkInput,
  UpdateNoteInput,
  UpdateProfileInput,
  UploadOptions,
  User,
} from './types'

/**
 * Account and session. Failures reject with an `ApiError`
 * (e.g. `security.bad_credentials`, `user.email_already_exists`).
 */
export interface AuthRepository {
  /** Creates an inactive account; the user must activate it through the emailed token before logging in. */
  signUp(input: SignUpInput): Promise<void>
  activate(token: string): Promise<void>
  /** Stores the session on success. */
  login(email: string, password: string): Promise<User>
  /** Revokes the refresh token and clears the session, even if the server cannot be reached. */
  logout(): Promise<void>
  /**
   * Resumes a session from a stored refresh token (e.g. after a reload).
   * Resolves `null` when there is none or it is no longer valid.
   */
  restoreSession(): Promise<User | null>
  me(): Promise<User>
  updateProfile(input: UpdateProfileInput): Promise<User>
}

/** Folders, notes, links, attachments, search, tags and trash. Everything is scoped to the signed-in user. */
export interface NotesRepository {
  // Folders
  /** Contents of a folder, or of the root level when `folderId` is omitted/null. */
  folderContents(folderId?: ID | null): Promise<FolderContents>
  createFolder(name: string, parentFolderId?: ID | null): Promise<Folder>
  renameFolder(id: ID, name: string): Promise<void>
  moveFolder(id: ID, parentFolderId: ID | null): Promise<void>
  /** Moves the folder and everything in it to the trash. */
  deleteFolder(id: ID): Promise<void>

  // Notes
  listNotes(params?: ListNotesParams): Promise<Page<NoteSummary>>
  getNote(id: ID): Promise<Note>
  createNote(input: CreateNoteInput): Promise<Note>
  updateNote(id: ID, input: UpdateNoteInput): Promise<void>
  moveNote(id: ID, destination: Destination): Promise<void>
  /** The notes and links directly under a note. */
  noteChildren(id: ID): Promise<NoteChildren>
  deleteNote(id: ID): Promise<void>

  // Links
  listLinks(params?: ListLinksParams): Promise<Page<Link>>
  getLink(id: ID): Promise<Link>
  createLink(input: CreateLinkInput): Promise<Link>
  updateLink(id: ID, input: UpdateLinkInput): Promise<void>
  moveLink(id: ID, destination: Destination): Promise<void>
  deleteLink(id: ID): Promise<void>

  // Attachments
  uploadNoteAttachment(noteId: ID, file: File, options?: UploadOptions): Promise<Attachment>
  uploadFolderAttachment(folderId: ID, file: File, options?: UploadOptions): Promise<Attachment>
  getAttachment(id: ID): Promise<AttachmentDetail>
  /** The file itself. Needs the session, so it cannot be a plain `<a href>`: use an object URL. */
  downloadAttachment(id: ID): Promise<Blob>
  deleteAttachment(id: ID): Promise<void>

  // Search and tags
  search(params: SearchParams): Promise<Page<SearchResult>>
  listTags(): Promise<TagCount[]>

  // Trash
  listTrash(): Promise<Trash>
  restore(kind: TrashKind, id: ID): Promise<void>
  deletePermanently(kind: TrashKind, id: ID): Promise<void>
  emptyTrash(): Promise<void>
}
