import { useBotStore } from "../stores/bot-store";
import { BotCard } from "./BotCard";
import { EmptyState } from "./EmptyState";

interface BotListProps {
  onCreateBot: () => void;
  onSelectBot: (id: string) => void;
}

export function BotList({ onCreateBot, onSelectBot }: BotListProps) {
  const { bots, loading } = useBotStore();

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-50"
          />
        ))}
      </div>
    );
  }

  if (bots.length === 0) {
    return <EmptyState onCreateBot={onCreateBot} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {bots.map((bot) => (
        <BotCard key={bot.id} bot={bot} onSelect={() => onSelectBot(bot.id)} />
      ))}
    </div>
  );
}
