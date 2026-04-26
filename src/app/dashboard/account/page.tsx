"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface Stats {
  gamesCreated: number;
  sessionsHosted: number;
  totalPlayers: number;
  memberSince: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password fields
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Stats
  const [stats, setStats] = useState<Stats>({
    gamesCreated: 0,
    sessionsHosted: 0,
    totalPlayers: 0,
    memberSince: "",
  });

  // Status messages
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setUserId(user.id);
      setEmail(user.email || "");

      // Load profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        const parts = (profile.display_name || "").split(" ");
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
        setAvatarUrl(profile.avatar_url || null);
        setReferralCode(profile.referral_code || "");
      }

      // Load stats in parallel
      const [gamesResult, sessionsResult, playersResult, referralResult] =
        await Promise.all([
          supabase
            .from("games")
            .select("id", { count: "exact", head: true })
            .eq("host_id", user.id),
          supabase
            .from("sessions")
            .select("id", { count: "exact", head: true })
            .eq("host_id", user.id),
          supabase
            .from("sessions")
            .select("id, session_players(id)")
            .eq("host_id", user.id),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("referred_by_id", user.id),
        ]);

      const totalPlayers =
        playersResult.data?.reduce(
          (sum, s) =>
            sum +
            (Array.isArray(s.session_players) ? s.session_players.length : 0),
          0
        ) || 0;

      setStats({
        gamesCreated: gamesResult.count || 0,
        sessionsHosted: sessionsResult.count || 0,
        totalPlayers,
        memberSince: user.created_at || "",
      });

      setReferralCount(referralResult.count || 0);
      setLoading(false);
    }

    load();
  }, []);

  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();

  async function handleUpdateProfile() {
    setProfileSaving(true);
    setProfileMessage("");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setProfileMessage("Profile updated successfully.");
    } catch (err: unknown) {
      setProfileMessage(
        err instanceof Error ? err.message : "Failed to update profile."
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleUpdateEmail() {
    setEmailSaving(true);
    setEmailMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        email: email.trim(),
      });

      if (error) throw error;

      setEmailMessage(
        "Confirmation email sent. Check your inbox to verify the new address."
      );
    } catch (err: unknown) {
      setEmailMessage(
        err instanceof Error ? err.message : "Failed to update email."
      );
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleUpdatePassword() {
    setPasswordSaving(true);
    setPasswordMessage("");

    if (newPassword.length < 6) {
      setPasswordMessage("Password must be at least 6 characters.");
      setPasswordSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      setPasswordSaving(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated successfully.");
    } catch (err: unknown) {
      setPasswordMessage(
        err instanceof Error ? err.message : "Failed to update password."
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !userId) return;

      setAvatarUploading(true);
      try {
        const supabase = createClient();
        const ext = file.name.split(".").pop();
        const path = `${userId}/avatar.${ext}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(path);

        // Update profile
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            avatar_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (updateError) throw updateError;

        setAvatarUrl(publicUrl);
      } catch (err) {
        console.error("Avatar upload failed:", err);
      } finally {
        setAvatarUploading(false);
      }
    },
    [userId]
  );

  async function handleRemoveAvatar() {
    if (!userId) return;
    setAvatarUploading(true);
    try {
      const supabase = createClient();

      // Update profile to remove avatar
      await supabase
        .from("profiles")
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      setAvatarUrl(null);
    } catch (err) {
      console.error("Remove avatar failed:", err);
    } finally {
      setAvatarUploading(false);
    }
  }

  function handleCopyReferral() {
    const link = `${window.location.origin}/signup?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 2000);
  }

  async function handleDeleteAccount() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account");
      }

      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      console.error("Delete account failed:", err);
      setDeleteConfirm(false);
      setDeleting(false);
    }
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Page Header — paper card, matches the game editor header treatment */}
      <header
        className="card-rebrand card-anchor relative z-10 p-6 lg:p-7"
        style={{
          background: "var(--paper)",
          borderColor: "rgba(0,0,0,0.18)",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderBottomWidth: 0,
          overflow: "visible",
        }}
      >
        <div className="flex items-center gap-4 mb-3">
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-ink shrink-0"
            style={{ background: "var(--sunflower)" }}
          >
            <Image
              src="/my-account.svg"
              alt=""
              width={28}
              height={28}
              className="nav-icon-light"
            />
          </span>
          <h1 className="font-display font-bold text-[32px] tracking-[-0.025em] leading-[1.05] text-ink">
            My Account
          </h1>
        </div>
        <p className="text-[15px] text-smoke leading-relaxed max-w-3xl">
          Manage your profile, stats, and account settings.
        </p>
      </header>

      {/* Panel — matches the game editor tab-panel treatment */}
      <div
        className="card-rebrand card-anchor tab-panel p-5 lg:p-6 pt-7 lg:pt-8 border-t-0"
        style={{
          background: "#ECE3D0",
          borderColor: "rgba(0,0,0,0.18)",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          boxShadow: "inset 0 6px 12px -6px rgba(0,0,0,0.18)",
        }}
      >
      <div className="space-y-6">
        {/* Display Name Preview + Avatar */}
        <div className="bg-paper border border-dune rounded-2xl p-6">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-paper flex items-center justify-center flex-shrink-0">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="Avatar"
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-smoke">
                    {(firstName.charAt(0) || email.charAt(0) || "?").toUpperCase()}
                  </span>
                )}
              </div>
              {/* Overlay on hover */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {avatarUploading ? (
                  <Spinner />
                ) : (
                  <svg
                    className="w-6 h-6 text-ink"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>

            {/* Name + Preview */}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-ink truncate">
                {displayName || "Set your name"}
              </h2>
              <p className="text-sm text-smoke mt-0.5">{email}</p>
              <p className="text-xs text-smoke/70 mt-1">
                Member since {formatDate(stats.memberSince)}
              </p>
            </div>

            {/* Avatar actions */}
            {avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                className="text-xs text-smoke hover:text-coral transition-colors self-start"
              >
                Remove photo
              </button>
            )}
          </div>
          <p className="text-xs text-smoke/70 mt-3">
            This is how your name appears to players in the lobby.
          </p>
        </div>

        {/* Game Stats */}
        <div className="bg-paper border border-dune rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-4">
            Hosting Stats
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-ink">
                {stats.gamesCreated}
              </div>
              <div className="text-sm text-smoke mt-1">Games Created</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-ink">
                {stats.sessionsHosted}
              </div>
              <div className="text-sm text-smoke mt-1">Sessions Hosted</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-ink">
                {stats.totalPlayers}
              </div>
              <div className="text-sm text-smoke mt-1">
                Players Entertained
              </div>
            </div>
          </div>
        </div>

        {/* Referral Section */}
        {referralCode && (
          <div className="bg-paper border border-dune rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                Refer a Friend
              </h2>
              {referralCount > 0 && (
                <span className="text-sm text-smoke">
                  {referralCount} referral{referralCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="text-sm text-smoke">
              Share your referral link and you&apos;ll both get a free month when
              they sign up.
            </p>

            <div className="flex items-center gap-3">
              <div className="flex-1 bg-paper border border-dune rounded-xl px-4 py-2.5 text-sm text-ink font-mono truncate">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/signup?ref=${referralCode}`
                  : `...signup?ref=${referralCode}`}
              </div>
              <Button variant="cta" onClick={handleCopyReferral} size="sm">
                {referralCopied ? "Copied!" : "Copy Link"}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-smoke">Your code:</span>
              <span className="text-xs font-mono font-bold text-ink">
                {referralCode}
              </span>
            </div>
          </div>
        )}

        {/* Profile Section */}
        <div className="bg-paper border border-dune rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Profile</h2>

          <div className="grid grid-cols-2 gap-4">
            <Input variant="paper"
              label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
            />
            <Input variant="paper"
              label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </div>

          {profileMessage && (
            <p
              className={`text-sm ${
                profileMessage.includes("success")
                  ? "text-teal-brand"
                  : "text-coral"
              }`}
            >
              {profileMessage}
            </p>
          )}

          <Button variant="cta"
            onClick={handleUpdateProfile}
            loading={profileSaving}
            size="sm"
          >
            Save Profile
          </Button>
        </div>

        {/* Email Section */}
        <div className="bg-paper border border-dune rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Email</h2>

          <Input variant="paper"
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
          />

          {emailMessage && (
            <p
              className={`text-sm ${
                emailMessage.includes("Confirmation")
                  ? "text-teal-brand"
                  : "text-coral"
              }`}
            >
              {emailMessage}
            </p>
          )}

          <Button variant="cta"
            onClick={handleUpdateEmail}
            loading={emailSaving}
            size="sm"
          >
            Update Email
          </Button>
        </div>

        {/* Password Section */}
        <div className="bg-paper border border-dune rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Change Password</h2>

          <Input variant="paper"
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
            type="password"
          />

          <Input variant="paper"
            label="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            type="password"
          />

          {passwordMessage && (
            <p
              className={`text-sm ${
                passwordMessage.includes("success")
                  ? "text-teal-brand"
                  : "text-coral"
              }`}
            >
              {passwordMessage}
            </p>
          )}

          <Button variant="cta"
            onClick={handleUpdatePassword}
            loading={passwordSaving}
            size="sm"
          >
            Update Password
          </Button>
        </div>

        {/* Delete Account */}
        <div className="bg-paper border border-[color-mix(in_srgb,var(--coral)_25%,transparent)] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-coral">Danger Zone</h2>
          <p className="text-sm text-smoke">
            Permanently delete your account and all associated data including
            games, sessions, and player history. This action cannot be undone.
          </p>

          {deleteConfirm ? (
            <div className="flex items-center gap-3">
              <Button
                variant="cta-danger"
                size="sm"
                onClick={handleDeleteAccount}
                loading={deleting}
              >
                Yes, Delete My Account
              </Button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="text-sm text-smoke hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="cta-danger"
              size="sm"
              onClick={handleDeleteAccount}
            >
              Delete Account
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
