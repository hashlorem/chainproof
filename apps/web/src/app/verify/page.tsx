"use client";

import { useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { PublicResult } from "@/components/PublicResult";
import { Button, Loading } from "@/components/ui";
import { sha256File } from "@/lib/api";

export default function PublicVerifyPage() {
  const [sha, setSha] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verify a file</h1>
        <p className="text-sm text-muted">
          Got a photo or a ChainProof PDF report? Check that it is exactly the version on record. Your file is hashed inside this browser and
          only the hash is sent, so the file itself never leaves your computer.
        </p>
      </div>
      {!sha ? (
        hashing ? (
          <Loading label="Computing SHA-256…" />
        ) : (
          <Dropzone
            onFile={async (f) => {
              setHashing(true);
              setName(f.name);
              setSha(await sha256File(f));
              setHashing(false);
            }}
          >
            <div>
              <p className="font-medium">Drop a file to verify</p>
              <p className="text-muted">Evidence file or PDF report</p>
            </div>
          </Dropzone>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <Button variant="secondary" onClick={() => setSha(null)}>Check another</Button>
          </div>
          <PublicResult sha256={sha} />
        </div>
      )}
    </div>
  );
}
