import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Trash2, Crown, Eye, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Team = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  invited_email: string | null;
  joined_at: string;
};

interface Props {
  userId: string;
}

export default function TeamWorkspace({ userId }: Props) {
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Record<string, TeamMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [invitingTeamId, setInvitingTeamId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, [userId]);

  const fetchTeams = async () => {
    setLoading(true);
    const { data } = await supabase.from("teams").select("*").order("created_at", { ascending: false });
    if (data) {
      setTeams(data as Team[]);
      // Fetch members for each team
      const membersMap: Record<string, TeamMember[]> = {};
      for (const team of data) {
        const { data: mData } = await supabase
          .from("team_members")
          .select("*")
          .eq("team_id", team.id);
        if (mData) membersMap[team.id] = mData as TeamMember[];
      }
      setMembers(membersMap);
    }
    setLoading(false);
  };

  const handleCreateTeam = async () => {
    if (!teamName) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("teams")
      .insert({ name: teamName, owner_id: userId })
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      // Add owner as admin member
      await supabase.from("team_members").insert({
        team_id: data.id,
        user_id: userId,
        role: "admin",
        invited_email: null,
      });
      toast({ title: "Team created" });
      setTeamName("");
      setShowCreate(false);
      fetchTeams();
    }
    setSaving(false);
  };

  const handleInvite = async (teamId: string) => {
    if (!memberUserId.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("team_members").insert({
      team_id: teamId,
      user_id: memberUserId.trim(),
      role: inviteRole,
      invited_email: null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Member added", description: `User ${memberUserId.trim()} added as ${inviteRole}` });
      setMemberUserId("");
      setInvitingTeamId(null);
      fetchTeams();
    }
    setSaving(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    await supabase.from("team_members").delete().eq("id", memberId);
    toast({ title: "Member removed" });
    fetchTeams();
  };

  const handleDeleteTeam = async (teamId: string) => {
    await supabase.from("teams").delete().eq("id", teamId);
    toast({ title: "Team deleted" });
    fetchTeams();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold font-serif text-foreground">Team Workspaces</h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Create Team
        </button>
      </div>

      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="glass-card rounded-xl p-6 border border-border space-y-4"
        >
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Team Name</label>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Engineering Team"
              className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleCreateTeam}
            disabled={saving || !teamName}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </motion.div>
      )}

      {teams.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-border">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No teams yet</h3>
          <p className="text-muted-foreground text-sm">Create a team to collaborate on agent monitoring with your colleagues.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => {
            const teamMembers = members[team.id] || [];
            const isOwner = team.owner_id === userId;
            return (
              <motion.div
                key={team.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-5 border border-border"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <h4 className="font-semibold text-foreground">{team.name}</h4>
                    {isOwner && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">Owner</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner && (
                      <>
                        <button
                          onClick={() => setInvitingTeamId(invitingTeamId === team.id ? null : team.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border transition-all"
                        >
                          <UserPlus className="w-3 h-3" /> Invite
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {invitingTeamId === team.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-2 mb-4 items-end"
                  >
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">Member User ID</label>
                      <input
                        value={memberUserId}
                        onChange={(e) => setMemberUserId(e.target.value)}
                        placeholder="supabase-user-uuid"
                        className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-foreground text-sm focus:outline-none"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <button
                      onClick={() => handleInvite(team.id)}
                      disabled={saving || !memberUserId.trim()}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </motion.div>
                )}

                <div className="space-y-2">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/10"
                    >
                      <div className="flex items-center gap-2">
                        {member.role === "admin" ? (
                          <Crown className="w-3 h-3 text-primary" />
                        ) : (
                          <Eye className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className="text-sm text-foreground">{member.invited_email || "Unknown"}</span>
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded">
                          {member.role}
                        </span>
                      </div>
                      {isOwner && member.user_id !== userId && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
