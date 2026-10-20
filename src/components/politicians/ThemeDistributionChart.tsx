import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { PoliticianThemeDistribution } from "@/services/voteStats";

interface ThemeDistributionChartProps {
  themes: PoliticianThemeDistribution[];
}

export function ThemeDistributionChart({ themes }: ThemeDistributionChartProps) {
  if (themes.length === 0) return null;

  const maxTotal = Math.max(...themes.map((t) => t.total));

  return (
    <Card>
      <CardHeader>
        <h2 className="title-card">Votes par thématique</h2>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {themes.slice(0, 8).map((theme) => (
            <div key={theme.theme}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>
                  {theme.icon} {theme.label}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {theme.total} vote{theme.total > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                <div
                  className="bg-green-500"
                  style={{ width: `${(theme.pour / maxTotal) * 100}%` }}
                  title={`Pour : ${theme.pour}`}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${(theme.contre / maxTotal) * 100}%` }}
                  title={`Contre : ${theme.contre}`}
                />
                <div
                  className="bg-yellow-500"
                  style={{ width: `${(theme.abstention / maxTotal) * 100}%` }}
                  title={`Abstention : ${theme.abstention}`}
                />
              </div>
            </div>
          ))}
        </div>
        {themes.length > 0 && (
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Pour
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Contre
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" /> Abstention
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
