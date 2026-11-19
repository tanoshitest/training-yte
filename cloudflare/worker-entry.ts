import { DurableObject } from "cloudflare:workers";

import worker from "./worker";
import type { DurableObjectStateLike } from "./durable-object-base";
import {
  SyllabusCatalog as SyllabusCatalogStorage,
  SyllabusDocumentObject as SyllabusDocumentStorage,
} from "./syllabus-storage";
import type { MutationInput, SyllabusDocument, SyllabusMeta } from "./syllabus-types";

type WorkerEnv = Record<string, unknown>;

function storageState(ctx: DurableObjectState): DurableObjectStateLike {
  return ctx as unknown as DurableObjectStateLike;
}

/**
 * Cloudflare RPC requires configured Durable Objects to inherit from the
 * runtime DurableObject class. The storage services stay runtime-neutral so
 * the VPS adapter can continue to use the same implementation.
 */
export class SyllabusCatalog extends DurableObject<WorkerEnv> {
  private storage() {
    return new SyllabusCatalogStorage(storageState(this.ctx), this.env);
  }

  list(): Promise<SyllabusMeta[]> {
    return this.storage().list();
  }

  create(input: Partial<SyllabusMeta>): Promise<SyllabusMeta> {
    return this.storage().create(input);
  }

  upsert(meta: SyllabusMeta): Promise<void> {
    return this.storage().upsert(meta);
  }

  remove(id: string): Promise<void> {
    return this.storage().remove(id);
  }
}

export class SyllabusDocumentObject extends DurableObject<WorkerEnv> {
  private storage() {
    return new SyllabusDocumentStorage(storageState(this.ctx), this.env);
  }

  getOrInit(seed?: SyllabusDocument): Promise<SyllabusDocument | null> {
    return this.storage().getOrInit(seed);
  }

  replace(document: SyllabusDocument): Promise<SyllabusDocument> {
    return this.storage().replace(document);
  }

  clear(): Promise<void> {
    return this.storage().clear();
  }

  mutate(input: MutationInput) {
    return this.storage().mutate(input);
  }
}

export default worker;
