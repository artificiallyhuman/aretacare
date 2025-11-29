import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Copyright and GitHub */}
          <div className="text-center sm:text-left">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              © 2025 AretaCare. Open Source Project.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              <a
                href="https://github.com/artificiallyhuman/aretacare"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline"
              >
                GitHub Repository
              </a>
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
            <Link
              to="/terms"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              Privacy Policy
            </Link>
            <a
              href="https://github.com/artificiallyhuman/aretacare/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              Report Issue
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
