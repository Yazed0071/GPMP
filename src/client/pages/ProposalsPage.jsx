// ProposalsPage: proposals of the groups a supervisor / examiner works with, or all proposals
// for the administrator, with Approve / Reject and Edit feedback (FR-6, FR-7, UC16, UC17).
import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import Card from '../components/common/Card.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import GroupSelect from '../components/common/GroupSelect.jsx';
import Tabs from '../components/common/Tabs.jsx';
import ProposalCard from '../components/project/ProposalCard.jsx';
import ReviewProposalModal from '../components/project/ReviewProposalModal.jsx';
import EditFeedbackModal from '../components/project/EditFeedbackModal.jsx';
import { useApi } from '../hooks/useApi.js';
import { useGroupParam } from '../hooks/useGroupParam.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { getProposals } from '../api/proposals.js';
import '../styles/project.css';

const STATUS_TABS = ['Pending Supervisor', 'Pending Examiner', 'Approved', 'Rejected'];

// The proposals shown in a tab; the ones waiting for the user come first
function filterByTab(proposals, tab) {
  let list = proposals;
  if (tab === 'mine') list = proposals.filter((p) => p.canReview);
  else if (tab !== 'all') list = proposals.filter((p) => p.status === tab);
  return [...list].sort((a, b) => Number(b.canReview) - Number(a.canReview));
}

export default function ProposalsPage() {
  const { user } = useAuth();
  const [groupId, setGroupId] = useGroupParam();
  const [tab, setTab] = useState('all');
  // { proposal, decision } while the review modal is open
  const [reviewing, setReviewing] = useState(null);
  const [editingFeedback, setEditingFeedback] = useState(null);

  const { data: proposals, loading, error, reload } = useApi(() => getProposals({ groupId }), [groupId]);

  // A new proposal or a decision by someone else: refresh the list
  useSocketEvent('notification:new', (notification) => {
    if (notification.type === 'Proposal') reload();
  });

  function afterChange() {
    setReviewing(null);
    setEditingFeedback(null);
    reload();
  }

  const all = proposals || [];
  const tabs = [
    { value: 'all', label: 'All', count: all.length },
    { value: 'mine', label: 'Waiting for me', count: all.filter((p) => p.canReview).length },
    ...STATUS_TABS.map((status) => ({
      value: status,
      label: status,
      count: all.filter((p) => p.status === status).length,
    })),
  ];
  const visible = filterByTab(all, tab);

  let content;
  if (loading) content = <Loading text="Loading proposals..." />;
  else if (error) content = <ErrorMessage error={error} onRetry={reload} />;
  else if (visible.length === 0) {
    content = (
      <Card>
        <EmptyState
          icon="proposal"
          title={tab === 'mine' ? 'Nothing is waiting for your review' : 'No proposals here'}
          message={
            all.length === 0
              ? 'Proposals submitted by your groups will appear here.'
              : 'Try another tab to see the other proposals.'
          }
        />
      </Card>
    );
  } else {
    content = (
      <div className="stack">
        {visible.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            isAdmin={user.role === 'Administrator'}
            onReview={(p, decision) => setReviewing({ proposal: p, decision })}
            onEditFeedback={(p) => setEditingFeedback(p)}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Proposals"
        subtitle={
          user.role === 'Examiner'
            ? 'Review the proposals your groups submitted after their supervisor approved them.'
            : 'Evaluate project proposals and give feedback to the students.'
        }
      />

      <div className="proj-toolbar">
        <div className="proj-search">
          <GroupSelect
            value={groupId}
            onChange={setGroupId}
            includeAll
            allLabel={user.role === 'Administrator' ? 'All groups' : 'All my groups'}
          />
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} ariaLabel="Proposal status" />

      {content}

      <ReviewProposalModal
        proposal={reviewing?.proposal || null}
        initialDecision={reviewing?.decision}
        onClose={() => setReviewing(null)}
        onReviewed={afterChange}
      />
      <EditFeedbackModal proposal={editingFeedback} onClose={() => setEditingFeedback(null)} onSaved={afterChange} />
    </>
  );
}
