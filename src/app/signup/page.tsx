"use client";

import { Suspense } from "react";
import { redirect, useSearchParams } from "next/navigation";

export default function SignupRedirect() {
  return (
    <Suspense fallback={null}>
      <SignupRedirectInner />
    </Suspense>
  );
}

function SignupRedirectInner() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  redirect(ref ? `/login?ref=${ref}` : "/login");
  return null;
}
