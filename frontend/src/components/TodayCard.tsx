import React from 'react';
import { SunIcon } from 'lucide-react';
import { useTrainerStore } from '../store/state';
import './MemorySchedule.css';

// Where the selected chapter stands right now: moves due for review, moves
// not learned yet, moves learned.
const TodayCard: React.FC = () => {
  const chapter = useTrainerStore((s) => s.repertoire.find((c) => c.uuid === s.selectedChapterId));
  const dueNow = useTrainerStore((s) => s.dueTimes.filter((t) => t <= 0).length);

  return (
    <div className="schedule-card">
      <div className="panel-header">
        <div className="panel-icon">
          <SunIcon />
        </div>
        <div className="panel-titles">
          <span className="panel-title">Today</span>
          <span className="panel-subtitle">{chapter ? chapter.name : 'No chapter selected'}</span>
        </div>
      </div>
      {chapter ? (
        <dl className="today-stats">
          <div className={dueNow > 0 ? 'is-due' : ''}>
            <dt>Due now</dt>
            <dd>{dueNow}</dd>
          </div>
          <div>
            <dt>To learn</dt>
            <dd>{chapter.unseenCount}</dd>
          </div>
          <div>
            <dt>Learned</dt>
            <dd>{chapter.enabledCount - chapter.unseenCount}</dd>
          </div>
        </dl>
      ) : (
        <p className="today-empty">Pick a chapter to see its progress.</p>
      )}
    </div>
  );
};

export default TodayCard;
