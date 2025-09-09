'use client';

import { useState } from 'react';
import { ChartBarIcon, UserGroupIcon, BeakerIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { QueryRequest, QueryResponse, Role } from '@omnicopilot/shared';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

function KPICard({ title, value, icon, color }: KPICardProps) {
  return (
    <div className="card">
      <div className="flex items-center">
        <div className={`flex-shrink-0 ${color}`}>
          {icon}
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd className="text-lg font-medium text-gray-900">{value}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

interface CitationLinkProps {
  citation: { n: number; title: string; url: string };
}

function CitationLink({ citation }: CitationLinkProps) {
  return (
    <li className="flex items-center space-x-2 py-2">
      <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-800 rounded-full flex items-center justify-center text-xs font-medium">
        {citation.n}
      </span>
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 hover:text-primary-800 text-sm truncate"
      >
        {citation.title}
      </a>
    </li>
  );
}

export default function HomePage() {
  const [role, setRole] = useState<Role>('dev');
  const [question, setQuestion] = useState('');
  const [project, setProject] = useState('');
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const queryRequest: QueryRequest = {
        role,
        question: question.trim(),
        project: project.trim() || undefined
      };

      const res = await fetch(`${apiUrl}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(queryRequest)
      });

      if (!res.ok) {
        throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      }

      const data: QueryResponse = await res.json();
      setResponse(data);
    } catch (err) {
      console.error('Query error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: 'dev', label: 'Developer', icon: '👨‍💻' },
    { value: 'qa', label: 'QA Engineer', icon: '🧪' },
    { value: 'manager', label: 'Manager', icon: '👔' }
  ];

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🤖 OmniCopilot
          </h1>
          <p className="text-xl text-gray-600">
            AI-powered development intelligence platform
          </p>
        </div>

        {/* KPI Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <KPICard
            title="Health Score"
            value="87%"
            icon={<ChartBarIcon className="h-6 w-6" />}
            color="text-success-500"
          />
          <KPICard
            title="P1 Issues"
            value="3"
            icon={<ExclamationTriangleIcon className="h-6 w-6" />}
            color="text-danger-500"
          />
          <KPICard
            title="Merged PRs (7d)"
            value="24"
            icon={<UserGroupIcon className="h-6 w-6" />}
            color="text-primary-500"
          />
          <KPICard
            title="CI Failures (7d)"
            value="7"
            icon={<BeakerIcon className="h-6 w-6" />}
            color="text-warning-500"
          />
        </div>

        {/* Query Interface */}
        <div className="max-w-4xl mx-auto">
          <div className="card">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Role Switcher */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select your role:
                </label>
                <div className="flex space-x-4">
                  {roleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRole(option.value as Role)}
                      className={`flex items-center px-4 py-2 rounded-md border transition-colors ${
                        role === option.value
                          ? 'bg-primary-50 border-primary-500 text-primary-700'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-2">{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Filter */}
              <div>
                <label htmlFor="project" className="block text-sm font-medium text-gray-700">
                  Project (optional)
                </label>
                <input
                  type="text"
                  id="project"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="e.g., frontend, backend, mobile"
                  className="mt-1 input"
                />
              </div>

              {/* Question Input */}
              <div>
                <label htmlFor="question" className="block text-sm font-medium text-gray-700">
                  Ask a question
                </label>
                <textarea
                  id="question"
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g., Why did the login tests fail? What are the recent deployment issues?"
                  className="mt-1 input resize-none"
                />
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`btn-primary w-full ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    'Ask OmniCopilot'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-6 p-4 bg-danger-50 border border-danger-200 rounded-md">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 text-danger-400" />
                <div className="ml-3">
                  <p className="text-sm text-danger-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Response Display */}
          {response && (
            <div className="mt-6 space-y-6">
              {/* Answer */}
              <div className="card">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-600 font-medium">🤖</span>
                    </div>
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">
                      Answer
                    </h3>
                    <div className="prose prose-sm max-w-none text-gray-700">
                      {response.answer.split('\n').map((paragraph, index) => (
                        <p key={index} className="mb-2">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    <div className="mt-4 text-xs text-gray-500">
                      Answered in {response.latency_ms}ms
                    </div>
                  </div>
                </div>
              </div>

              {/* Citations */}
              {response.citations.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    📚 Sources ({response.citations.length})
                  </h3>
                  <ul className="space-y-1">
                    {response.citations.map((citation) => (
                      <CitationLink key={citation.n} citation={citation} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
