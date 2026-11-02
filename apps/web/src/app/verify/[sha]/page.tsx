"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PublicResult } from "@/components/PublicResult";

/** Where the QR codes in PDF reports point. */
export default function VerifyHashPage() {
  const { sha } = useParams<{ sha: string }>();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading text-2xl">Evidence record</h1>
        <p className="text-sm text-muted">
          Have the file? <Link href="/verify" className="text-accent hover:underline">Drop it here</Link> to confirm your copy matches this record.
        </p>
      </div>
      <PublicResult sha256={sha.toLowerCase()} />
    </div>
  );
}
