import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { QueuedCommand } from '../../services/api/TestApiService';
import { Loader2, X, Clock, Trash2 } from 'lucide-react';

interface CommandQueueProps {
  queue: QueuedCommand[];
  onCancel: (id: string) => void;
  onClear: () => void;
}

export function CommandQueue({ queue, onCancel, onClear }: CommandQueueProps) {
  if (queue.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5" />
          Command Queue
          <Badge variant="secondary" className="ml-2">
            {queue.length}
          </Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-xs h-8 text-gray-500 hover:text-red-600 hover:bg-red-50"
          title="Clear all commands"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear All
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3">
            {queue.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border shadow-sm">
                    {item.status === 'running' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <span className="text-xs font-bold text-gray-500">{index + 1}</span>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm">
                      {item.commandString || item.originalCommand || item.commandType}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant={item.status === 'running' ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        {item.status === 'running' ? 'Running' : 'Queued'}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(item.id)}
                  className="text-gray-500 hover:text-red-600"
                  title="Cancel command"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
