import { watch } from 'vue';
import { useFranchiseStore } from '@/stores';

export function useTeamTheme() {
    const franchiseStore = useFranchiseStore();

    function applyTheme(teamId: string | null) {
        const team = franchiseStore.teams.find(t => t.id === teamId);
        if (team) {
            document.documentElement.style.setProperty('--team-primary',   team.colors.primary);
            document.documentElement.style.setProperty('--team-secondary',  team.colors.secondary);
            document.documentElement.style.setProperty('--team-tertiary',   team.colors.tertiary);
        }
    }

    watch(
        [
            () => franchiseStore.franchise?.team_id,
            () => franchiseStore.teams,
        ],
        ([teamId, teams]) => {
            if (teamId && teams.length > 0) {
                applyTheme(teamId);
            }
        },
        { immediate: true }
    );

    return { applyTheme };
}