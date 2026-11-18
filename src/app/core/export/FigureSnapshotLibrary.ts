import { ref, shallowRef } from "vue";
import {
  validateFigureSnapshotDocuments,
  type FigureSnapshot,
  type FigureSnapshotDocument,
} from "./FigureSnapshotDocument";

/** Owned by one displayed workspace; snapshots do not participate in live rendering configuration. */
export class FigureSnapshotLibrary {
  private readonly items = shallowRef<readonly FigureSnapshot[]>([]);
  private readonly change = ref(0);
  private readonly saved = ref(0);
  public get snapshots(): readonly FigureSnapshot[] {
    return this.items.value;
  }
  public get revision(): number {
    return this.change.value;
  }
  public get dirty(): boolean {
    return this.change.value !== this.saved.value;
  }
  public documents(): FigureSnapshotDocument[] {
    return this.items.value.map((item) => ({ ...item.document }));
  }
  public add(snapshot: FigureSnapshot): void {
    validateFigureSnapshotDocuments([...this.documents(), snapshot.document]);
    this.items.value = [...this.items.value, snapshot];
    this.change.value++;
  }
  public remove(id: string): void {
    const next = this.items.value.filter((item) => item.document.id !== id);
    if (next.length === this.items.value.length) return;
    this.items.value = next;
    this.change.value++;
  }
  public restore(prepared: readonly FigureSnapshot[]): void {
    validateFigureSnapshotDocuments(prepared.map((item) => item.document));
    this.items.value = [...prepared];
    this.change.value++;
    this.saved.value = this.change.value;
  }
  public markSaved(revision: number): void {
    this.saved.value = revision;
  }
  public copyFrom(previous: FigureSnapshotLibrary): void {
    this.items.value = previous.items.value;
    this.change.value = previous.change.value;
    this.saved.value = previous.saved.value;
  }
}
