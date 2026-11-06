import { ReactNode } from 'react';
import { useTrainerStore } from '../store/state';
import {
  BrainIcon,
  CheckCircle2Icon,
  GraduationCapIcon,
  HistoryIcon,
  LucideRepeat2,
  MousePointer,
  XIcon,
} from 'lucide-react';
import { Explorer } from './Explorer';
import './UserTip.css';

type TipAction = {
  label: ReactNode;
  onClick: () => void;
};

type TipProps = {
  icon: ReactNode;
  title: string;
  description: string;
  titleClassName?: string;
  descriptionClassName?: string;
  /** extra class on the icon wrapper, for tips whose glyph is sized differently */
  iconClassName?: string;
  actions?: TipAction[];
  grayIcon?: boolean;
};

const Tip = ({
  icon,
  title,
  description,
  titleClassName = 'tip-title',
  descriptionClassName = 'tip-description',
  iconClassName = '',
  actions,
  grayIcon = true,
}: TipProps) => (
  <div className="tip">
    <div className="tip-main">
      <div className="tip-icon-slot">
        <div className={`tip-icon ${grayIcon ? 'is-boxed' : ''} ${iconClassName}`}>{icon}</div>
      </div>
      <div className="tip-text">
        <span className={titleClassName}>{title}</span>
        <span className={descriptionClassName}>{description}</span>
      </div>
    </div>

    {actions && actions.length > 0 && (
      <div className="tip-actions">
        {actions.map((action, i) => (
          <button key={i} className="tip-action" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

const EmptyRepertoire = () => (
  <Tip
    icon={<GraduationCapIcon />}
    title="Repertoire is empty"
    description={'Click "Add to Repertoire" to get started!'}
  />
);

const Unselected = () => (
  <Tip
    icon={<MousePointer />}
    title="No training mode selected"
    description="Click Learn or Recall to start training"
    descriptionClassName="tip-description-small"
  />
);

export const UserTip = () => {
  const { userTip, repertoire, selectedChapterId, trainingMethod, trainableContext, lastGuess } =
    useTrainerStore();
  const train = useTrainerStore((s) => s.train);
  const setNextTrainable = useTrainerStore((s) => s.setNextTrainablePosition);
  const makeMove = useTrainerStore((s) => s.makeMove);
  const setUserTip = useTrainerStore((s) => s.setUserTip);
  const startQuiz = useTrainerStore((s) => s.startQuiz);
  const quizQueue = useTrainerStore((s) => s.quizQueue);
  const quizTotal = useTrainerStore((s) => s.quizTotal);
  const quizMistakes = useTrainerStore((s) => s.quizMistakes);

  if (repertoire.length == 0) return <EmptyRepertoire />;
  if (!trainingMethod) return <Unselected />;
  // In edit mode the coaching tip is irrelevant; surface the opening
  // explorer for the currently selected position instead. The Explorer
  // tracks selectedNode itself (useExplorer) and refetches on change.
  if (trainingMethod == 'edit') {
    return <Explorer />;
  }

  const chapter = repertoire.find((c) => c.uuid === selectedChapterId);
  if (!chapter) return null;
  const san = trainableContext?.targetMove?.data.san;
  const isWhite = chapter.trainAs == 'white';
  const side = isWhite ? 'White' : 'Black';
  // the move being asked is no longer in the queue
  const quizStep = quizTotal - quizQueue.length;
  switch (userTip) {
    case 'lineDone':
      return (
        <Tip
          icon={<CheckCircle2Icon />}
          title="Line complete"
          description="Test your memory: replay the whole line from the start, without arrows."
          descriptionClassName="tip-description-small"
          actions={[
            { label: 'TEST NOW', onClick: startQuiz },
            { label: 'KEEP LEARNING', onClick: setNextTrainable },
          ]}
        />
      );
    case 'quiz':
      return (
        <Tip
          icon={<BrainIcon />}
          title={`Memory check · ${quizStep}/${quizTotal}`}
          description={`What does ${side} play here?`}
        />
      );
    case 'quizFail':
      return (
        <Tip
          icon={<XIcon className="tip-cross" />}
          title={`${lastGuess} is not it`}
          description={`The move is ${san}. Play it to continue.`}
        />
      );
    case 'quizDone':
      return (
        <Tip
          icon={<CheckCircle2Icon />}
          title={
            quizMistakes === 0
              ? `All ${quizTotal}/${quizTotal} moves remembered!`
              : `${quizTotal - quizMistakes}/${quizTotal} moves correct`
          }
          description={
            quizMistakes === 0
              ? 'This line has stuck. On to the next one.'
              : 'Worth one more run before moving on.'
          }
          descriptionClassName="tip-description-small"
          actions={
            quizMistakes === 0
              ? [
                  { label: 'KEEP LEARNING', onClick: setNextTrainable },
                  { label: 'TEST AGAIN', onClick: startQuiz },
                ]
              : [
                  { label: 'TEST AGAIN', onClick: startQuiz },
                  { label: 'KEEP LEARNING', onClick: setNextTrainable },
                ]
          }
        />
      );
    case 'recall':
      return (
        <Tip
          icon={<HistoryIcon />}
          title="Play the move"
          description={`What does ${isWhite ? 'White' : 'Black'} play here?`}
        />
      );
    case 'learn':
      return (
        <Tip
          icon={<GraduationCapIcon />}
          title="Play the move"
          description={`${isWhite ? 'White' : 'Black'} plays ${san}`}
        />
      );
    case 'empty':
      return (
        <Tip
          icon={<XIcon />}
          iconClassName="tip-icon-small"
          title={`No more moves to ${trainingMethod}`}
          description="Try switching the training mode or modifying settings"
          titleClassName="tip-title-muted"
          descriptionClassName="tip-description-small"
        />
      );
    case 'alternate':
      return (
        <Tip
          icon={<LucideRepeat2 color={'gold'} />}
          iconClassName="tip-icon-alternate"
          title={`${lastGuess} is an alternate move`}
          description="Try playing a different move"
          grayIcon={false}
        />
      );
    case 'fail':
      return (
        <Tip
          icon={<XIcon className="tip-cross" />}
          title={`${lastGuess} is incorrect`}
          description={`${isWhite ? 'White' : 'Black'} plays ${san}`}
          actions={[
            {
              label: 'CONTINUE',
              onClick: () => {
                train(false);
                setNextTrainable();
              },
            },
            {
              label: 'UNDO',
              onClick: () => setUserTip('recall'),
            },
            {
              label: (
                <>
                  ADD <span className="tip-action-move">{lastGuess}</span>
                </>
              ),
              onClick: () => {
                makeMove(lastGuess);
                setUserTip('recall');
              },
            },
          ]}
        />
      );
    default:
      return <div>Other</div>;
  }
};
