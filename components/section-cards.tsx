"use client";

import { GaugeIcon, MessageSquareIcon, ShieldCheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AgentRole } from "@/lib/generated/prisma";

type SectionCardsProps = {
  stats: {
    userId?: string;
    verified?: boolean;
    roles?: AgentRole[];
    expiresAt?: string;
    messageCount: number;
    pendingMessages: number;
    autoReply: boolean;
    modelProvider: string;
  };
};

const sessionTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

function SessionSummary({
  userId,
  verified,
  // roles,
  expiresAt,
}: SectionCardsProps["stats"]) {
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const expiryLabel =
    expiryDate && !Number.isNaN(expiryDate.getTime())
      ? `Session expires at ${sessionTimeFormatter.format(expiryDate)}`
      : "Active session window";

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Session</CardDescription>
        <CardTitle className="break-words text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {userId ?? "Not signed in"}
        </CardTitle>
        <CardAction>
          {/* <div className="flex flex-wrap gap-2"> */}
          <Badge
            variant={verified ? "default" : "outline"}
            className="rounded-lg text-xs"
          >
            {verified ? "Verified" : "Pending"}
          </Badge>
          {/* {(roles ?? []).map((role) => (
              <Badge
                key={role}
                variant="secondary"
                className="rounded-lg text-xs capitalize"
              >
                {role}
              </Badge>
            ))} */}
          {/* </div> */}
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          Session expiry time
        </div>
        <div className="text-muted-foreground">{expiryLabel}</div>
      </CardFooter>
    </Card>
  );
}

function MessageSummary({
  messageCount,
  pendingMessages,
}: Pick<SectionCardsProps["stats"], "messageCount" | "pendingMessages">) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Conversation load</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {messageCount}
        </CardTitle>
        <CardAction>
          <Badge
            variant="outline"
            className="flex items-center gap-1 rounded-lg text-xs"
          >
            <MessageSquareIcon className="size-3" />
            {pendingMessages} pending
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          Live chat history retained across views
        </div>
        <div className="text-muted-foreground">
          Latest messages surface automatically in the activity feed.
        </div>
      </CardFooter>
    </Card>
  );
}

function ModelSummary({
  autoReply,
  modelProvider,
}: Pick<SectionCardsProps["stats"], "autoReply" | "modelProvider">) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Assistant settings</CardDescription>
        <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums capitalize">
          {modelProvider}
        </CardTitle>
        <CardAction>
          <Badge
            variant={autoReply ? "outline" : "secondary"}
            className="flex gap-1 rounded-lg text-xs"
          >
            <GaugeIcon className="size-3" />
            {autoReply ? "Auto-reply on" : "Manual only"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          Controls mirror the agent workspace settings
        </div>
        <div className="text-muted-foreground">
          Switch providers from the agent view panel as needed.
        </div>
      </CardFooter>
    </Card>
  );
}

function StabilitySummary() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Handoff health</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          Healthy
        </CardTitle>
        <CardAction>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <ShieldCheckIcon className="size-3" />
            synced
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          Case context synced between customer and agent panes
        </div>
        <div className="text-muted-foreground">
          Zero re-auth prompts detected in this session.
        </div>
      </CardFooter>
    </Card>
  );
}

export function SectionCards({ stats }: SectionCardsProps) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-2 2xl:grid-cols-4">
      <SessionSummary {...stats} />
      <MessageSummary
        messageCount={stats.messageCount}
        pendingMessages={stats.pendingMessages}
      />
      <ModelSummary
        autoReply={stats.autoReply}
        modelProvider={stats.modelProvider}
      />
      <StabilitySummary />
    </div>
  );
}
