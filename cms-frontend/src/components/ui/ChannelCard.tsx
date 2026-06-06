import React from "react"
import { cn } from "../../lib/utils"
import { Signal, SignalHigh, SignalLow, SignalMedium } from "lucide-react"

export interface ChannelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  channelNumber: number | string;
  channelName: string;
  thumbnailUrl?: string;
  signalStrength?: 0 | 1 | 2 | 3;
}

export function ChannelCard({
  className,
  channelNumber,
  channelName,
  thumbnailUrl,
  signalStrength = 3,
  ...props
}: ChannelCardProps) {
  
  const renderSignalIcon = () => {
    const props = { className: "w-4 h-4 text-green-500", strokeWidth: 1.5 };
    if (signalStrength === 3) return <SignalHigh {...props} />;
    if (signalStrength === 2) return <SignalMedium {...props} className="w-4 h-4 text-amber-500" strokeWidth={1.5} />;
    if (signalStrength === 1) return <SignalLow {...props} className="w-4 h-4 text-error" strokeWidth={1.5} />;
    return <Signal {...props} className="w-4 h-4 text-outline" strokeWidth={1.5} />;
  }

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface transition-all hover:border-primary",
        className
      )}
      {...props}
    >
      <div className="relative aspect-video w-full bg-surface-container-high">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={channelName}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-container-highest text-on-surface-variant">
            No Signal Image
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
        
        {/* Top left signal strength */}
        <div className="absolute left-3 top-3 flex items-center justify-center rounded-full bg-black/50 p-1.5 backdrop-blur-md">
          {renderSignalIcon()}
        </div>

        {/* Bottom content overlay */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div>
            <div className="text-xl font-bold text-white drop-shadow-md">
              CH {channelNumber}
            </div>
            <div className="text-sm font-medium text-white/90 line-clamp-1 drop-shadow-md">
              {channelName}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
