"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupAssignmentRows, sameGroupScreenSelection, setMatchingGroupScreens } from "@/components/group-screen-selection";
import type { Entity, Member } from "@/lib/store";

type Props = {
  group: Entity;
  entities: Entity[];
  members: Member[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onSave: (body: { action: "group-members"; groupId: string; screenIds: string[]; expectedScreenIds: string[] }) => Promise<boolean | undefined>;
};

export default function GroupScreenAssignment({ group, entities, members, busy, error, onClose, onCloseAutoFocus, onSave }: Props) {
  const [initial] = useState(() => new Set(members.filter(member => member.groupId === group.id).map(member => member.screenId)));
  const [selected, setSelected] = useState(() => new Set(initial));
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const saving = useRef(false);
  const locked = busy || submitting;
  const matching = useMemo(() => groupAssignmentRows(entities, query), [entities, query]);
  const matchingIds = matching.map(({ screen }) => screen.id);
  const allMatchingSelected = matching.length > 0 && matching.every(({ screen }) => selected.has(screen.id));
  const anyMatchingSelected = matching.some(({ screen }) => selected.has(screen.id));
  const changed = !sameGroupScreenSelection(initial, selected);
  const searching = !!query.trim();

  function close() {
    if (!busy && !saving.current) onClose();
  }

  async function save() {
    if (busy || saving.current || !changed) return;
    saving.current = true;
    setSubmitting(true);
    let saved = false;
    try {
      saved = !!await onSave({ action: "group-members", groupId: group.id, screenIds: [...selected], expectedScreenIds: [...initial] });
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
    if (saved) onClose();
  }

  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="adm-dialog adm-group-assignment" showCloseButton={!locked} aria-busy={locked}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={event => { if (busy || saving.current) event.preventDefault(); }}
      onInteractOutside={event => { if (busy || saving.current) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{group.name}</DialogTitle>
        <DialogDescription>Choose screens from any location, then save your changes.</DialogDescription>
      </DialogHeader>
      {error && <div className="adm-error" role="alert">{error}</div>}
      <div className="adm-search">
        <Search size={17}/>
        <input aria-label="Search group screens" placeholder="Search screens or locations" value={query} disabled={locked} onChange={event => setQuery(event.target.value)}/>
      </div>
      <div className="adm-group-assignment-toolbar">
        <span className="adm-assignment-count" role="status">{selected.size} {selected.size === 1 ? "screen" : "screens"} selected</span>
        <div className="adm-group-assignment-bulk">
          <button type="button" disabled={locked || !matching.length || allMatchingSelected} onClick={() => setSelected(current => setMatchingGroupScreens(current, matchingIds, true))}>
            {searching ? `Select all matching (${matching.length})` : "Select all"}
          </button>
          <button type="button" disabled={locked || !anyMatchingSelected} onClick={() => setSelected(current => setMatchingGroupScreens(current, matchingIds, false))}>
            {searching ? "Clear matching" : "Clear selection"}
          </button>
        </div>
      </div>
      <div className="adm-assignment-list">
        {matching.map(({ screen, location }) => <label key={screen.id}>
          <input type="checkbox" checked={selected.has(screen.id)} disabled={locked} onChange={event => { const enabled = event.target.checked; setSelected(current => setMatchingGroupScreens(current, [screen.id], enabled)); }}/>
          <span><strong>{screen.name}</strong><small>{location}</small></span>
        </label>)}
        {!matching.length && <div className="adm-empty">{entities.some(entity => entity.type === "screen") ? "No screens match your search." : "Add screens before assigning them to a group."}</div>}
      </div>
      <div className="adm-form-actions adm-group-assignment-actions">
        <button type="button" className="adm-secondary-btn" disabled={locked} onClick={close}>Cancel</button>
        <button type="button" className="adm-primary-btn" disabled={locked || !changed} onClick={() => void save()}>{locked ? "Saving..." : "Save changes"}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
