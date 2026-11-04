# Studio interaction behavior

Save, conflict, draft, and board behavior. Visual tokens, selection color, and component contracts are in the root [design.md](../../design.md). `#/studio`-only controls are in [specimen.md](specimen.md).

## Save lifecycle

Pristine, then dirty, then saving, then saved. Failures land on error or conflict with the dirty draft intact. Editing during saving creates a newer dirty draft. When the older response arrives, it cannot mark those newer edits saved. Disable only the duplicate submission, not unrelated navigation. A saved notice may fade after 2 seconds. Error and conflict stay until resolved. Never use that timeout as proof of a write.

Visible blocking error or conflict wins over an old Saved notice. Dirty is scoped to a record and a draft generation. Disabled, busy, selected, and invalid are independent. A busy indicator does not erase a field label.

## Draft identity

Identify an editor by project id, record type, record id, and base revision. Do not key a draft only by array index or project name. On success, merge only the submitted generation. On 409, keep the local draft and the latest service revision for a deliberate comparison. Review latest shows the saved fields. Reapply my draft chooses their revision. The next Save performs the write. Discard restores the known service state. Reset in a motion fixture restores its named preset. Those are different actions.

Unsaved system drafts are transient app-session memory, held by project, direction, and kind above the replaceable shells. Crossing a breakpoint, closing the panel, switching tabs, or visiting another project must not drop that draft. Browser unload warns. A full reload is not in-memory draft recovery.

## Connection, empty, and feedback

Production has no healthy Connected control. Reconnecting shows a banner that current data may be stale. Unavailable explains how to start the service. Both offer Retry connection. Keep content and drafts usable while disconnected. Do not report a write as successful when it was not.

The empty board shows a static motif, “Drop your references here,” and one sentence. Hide it after any reference, note, or active group. An archived-only board may show it again. An archived project is labeled and can be reopened.

Field errors sit under the field. Form errors sit near the action. A service outage sits in the shell. Mutation success sits beside its action. Do not add a global toast for every save. `aria-live="polite"` announces committed outcomes. Use an assertive alert only for a blocking failure.

Archive names the object and explains that it can be restored. Do not add permanent deletion or approval controls as styling work.

## Inspector

A product inspector opens through an explicit action. Selection, import, and camera moves do not open it. Close stays reachable. Escape closes the deepest select or menu first, then the panel. Hidden panels cannot take input.

Header: title, kind and role, Close. Then preview and source, shared reference facts, use in this project, and provenance. Say when fields are shared across projects. One editor is active at a time. Sections that persist separate records get their own Save. On project change, late saves must not target the newly selected item.

The original image viewer is a dialog with contain-fit media, zoom, a source link, and Close. Regions stay bound to original pixels.

## Board

One dock: Note, Group, Library, Undo, and Redo. Images are dropped or pasted onto the canvas. Dock add opens Note and Link forms only. Imported references are selected without opening a panel or moving the camera.

Click selects. Shift adds or removes. A blank-canvas click clears selection unless a drag rectangle is in progress. Nodes stay keyboard focusable. Enter edits inline text. Arrow keys move selected nodes. Delete and Backspace do not delete records while editing text or without a scoped action. Selection does not change a role, save a direction, or message an agent.

A note shows its text. Double-click or focus plus Enter edits it. Ctrl or Cmd plus Enter, or blur, saves. Escape cancels the current edit. Group creation starts inline naming. Enter or blur saves the name. Selected frames offer Rename, Duplicate, and Ungroup. Inline renaming pauses during membership operations.

Keep editing nodes mounted while panning. A blur or submit during a save queues the newer text against the accepted revision. Escape discards later unsent typing. An already accepted submission stays authoritative. Keyboard completion returns focus to the object. Blur must not steal the new focus target.

Groups are frames with a name and an item count. Moving a frame moves its children in parent-local coordinates. Archive ungroups references without moving their absolute positions. Restore reactivates the frame and does not silently regroup inbox items. Duplicate copies the saved direction, its placements, and its contextual notes, and shares global sources.

Commit completed gestures as atomic arrangements. Viewport stays local to the tab. Undo and redo persist arrangements and stop on conflicts. A background reference arrival must not reset an active drag or resize.

Images and links keep optional Reference details and Usage and crop disclosures. A selected group can open Systems in the inspector. System edits save explicitly. Motion fields stay compatible: Instant has no duration; tween exposes milliseconds and easing; a physics spring exposes mass, stiffness, damping, initial velocity, and a named engine. Static images do not validate motion.

## Fields and search

Validation runs on submit, then on the dirty fields that failed. Do not show a red error on an untouched empty field. Dirty fields keep their values when the network or a conflict fails.

Library keyword search submits on Enter and keeps the previous results while the request is in flight. Pagination resets when the submitted query changes. The target Kind radio, optional Tag field, and filter chips are specified in the root design file and are not built yet. Do not invent a second field style for them.

## Dialogs and menus

Native dialog, labeled title, initial focus on the first useful field or a safe confirm action. Escape closes unless a committed operation cannot be interrupted. A dirty draft that would be discarded asks Keep editing or Discard changes. A surface that retains the draft can close. Data submission closes only after the service accepts it.

Menus use arrow keys, Home, End, Enter, Space, and Escape. A select chooses a value. A menu runs a command. Tabs switch associated panels.

## Theme and structure

Light defaults live on the Studio scope. OS dark applies when theme is not explicit. Then an explicit light or dark override wins. Portaled popovers stay in the Studio theme scope. Native dialogs inherit it. Target previews use an isolated root.

One page heading, named navigation, a main board, and a labeled inspector. A nonmodal desktop inspector does not steal focus on every selection.
