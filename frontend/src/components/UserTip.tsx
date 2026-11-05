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
  const side = isWhite ? 'Trắng' : 'Đen';
  // the move being asked is no longer in the queue
  const quizStep = quizTotal - quizQueue.length;
  switch (userTip) {
    case 'lineDone':
      return (
        <Tip
          icon={<CheckCircle2Icon />}
          title="Xong một nhánh"
          description="Dừng lại kiểm tra trí nhớ: tự đi lại cả nhánh từ đầu, không có mũi tên gợi ý."
          descriptionClassName="tip-description-small"
          actions={[
            { label: 'KIỂM TRA NGAY', onClick: startQuiz },
            { label: 'HỌC TIẾP', onClick: setNextTrainable },
          ]}
        />
      );
    case 'quiz':
      return (
        <Tip
          icon={<BrainIcon />}
          title={`Kiểm tra trí nhớ · ${quizStep}/${quizTotal}`}
          description={`${side} đi gì ở đây?`}
        />
      );
    case 'quizFail':
      return (
        <Tip
          icon={<XIcon className="tip-cross" />}
          title={`${lastGuess} chưa đúng`}
          description={`Nước đúng là ${san}. Đi lại nước đó để tiếp tục.`}
        />
      );
    case 'quizDone':
      return (
        <Tip
          icon={<CheckCircle2Icon />}
          title={
            quizMistakes === 0
              ? `Nhớ đúng cả ${quizTotal}/${quizTotal} nước!`
              : `Đúng ${quizTotal - quizMistakes}/${quizTotal} nước`
          }
          description={
            quizMistakes === 0
              ? 'Nhánh này đã vào đầu. Học tiếp nhánh sau nhé.'
              : 'Nên kiểm tra lại một lượt nữa trước khi học tiếp.'
          }
          descriptionClassName="tip-description-small"
          actions={
            quizMistakes === 0
              ? [
                  { label: 'HỌC TIẾP', onClick: setNextTrainable },
                  { label: 'KIỂM TRA LẠI', onClick: startQuiz },
                ]
              : [
                  { label: 'KIỂM TRA LẠI', onClick: startQuiz },
                  { label: 'HỌC TIẾP', onClick: setNextTrainable },
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
