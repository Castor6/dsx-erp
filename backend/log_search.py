#!/usr/bin/env python3
"""
日志搜索工具 - 用于搜索和分析API错误日志

使用方法:
python log_search.py --help
python log_search.py --error                    # 显示所有错误日志
python log_search.py --request-id <id>          # 根据请求ID搜索
python log_search.py --user <username>          # 根据用户搜索
python log_search.py --endpoint <path>          # 根据API端点搜索
python log_search.py --date 2024-01-01          # 根据日期搜索
python log_search.py --status 500               # 根据状态码搜索
"""

import argparse
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any
import re


class LogSearcher:
    def __init__(self, log_dir: str = "logs"):
        self.log_dir = log_dir
    
    def search_logs(self, 
                   log_file: str = None,
                   request_id: str = None,
                   user: str = None,
                   endpoint: str = None,
                   date: str = None,
                   status_code: int = None,
                   error_only: bool = False,
                   limit: int = 100) -> List[Dict[Any, Any]]:
        """搜索日志"""
        
        results = []
        log_files = []
        
        if log_file:
            log_files = [os.path.join(self.log_dir, log_file)]
        else:
            # 搜索所有日志文件
            if os.path.exists(self.log_dir):
                for file in os.listdir(self.log_dir):
                    if file.endswith('.log'):
                        log_files.append(os.path.join(self.log_dir, file))
        
        for file_path in log_files:
            if os.path.exists(file_path):
                results.extend(self._search_file(
                    file_path, request_id, user, endpoint, 
                    date, status_code, error_only
                ))
        
        # 按时间戳排序
        results.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        return results[:limit]
    
    def _search_file(self, 
                    file_path: str,
                    request_id: str = None,
                    user: str = None,
                    endpoint: str = None,
                    date: str = None,
                    status_code: int = None,
                    error_only: bool = False) -> List[Dict[Any, Any]]:
        """搜索单个文件"""
        
        results = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    
                    # 尝试解析JSON格式的日志
                    log_entry = None
                    if line.startswith('{'):
                        try:
                            log_entry = json.loads(line)
                        except json.JSONDecodeError:
                            # 如果不是JSON格式，创建一个简单的条目
                            log_entry = {
                                'message': line,
                                'file': file_path,
                                'line_number': line_num
                            }
                    else:
                        # 普通文本格式日志
                        log_entry = {
                            'message': line,
                            'file': file_path,
                            'line_number': line_num
                        }
                    
                    # 应用过滤条件
                    if self._matches_filters(log_entry, request_id, user, endpoint, 
                                           date, status_code, error_only):
                        log_entry['file'] = os.path.basename(file_path)
                        results.append(log_entry)
        
        except Exception as e:
            print(f"Error reading file {file_path}: {e}")
        
        return results
    
    def _matches_filters(self, 
                        log_entry: Dict[Any, Any],
                        request_id: str = None,
                        user: str = None,
                        endpoint: str = None,
                        date: str = None,
                        status_code: int = None,
                        error_only: bool = False) -> bool:
        """检查日志条目是否匹配过滤条件"""
        
        # 错误日志过滤
        if error_only:
            level = log_entry.get('level', '').upper()
            message = log_entry.get('message', '').lower()
            if level not in ['ERROR', 'CRITICAL'] and 'error' not in message and 'exception' not in message:
                return False
        
        # 请求ID过滤
        if request_id and log_entry.get('request_id') != request_id:
            return False
        
        # 用户过滤
        if user:
            log_user = log_entry.get('username') or log_entry.get('user_id')
            if not log_user or user.lower() not in str(log_user).lower():
                return False
        
        # 端点过滤
        if endpoint:
            log_endpoint = log_entry.get('endpoint', '')
            if endpoint.lower() not in log_endpoint.lower():
                return False
        
        # 日期过滤
        if date:
            timestamp = log_entry.get('timestamp', '')
            if timestamp and not timestamp.startswith(date):
                return False
        
        # 状态码过滤
        if status_code:
            log_status = log_entry.get('status_code')
            if log_status != status_code:
                return False
        
        return True
    
    def format_output(self, results: List[Dict[Any, Any]], verbose: bool = False) -> str:
        """格式化输出结果"""
        
        if not results:
            return "没有找到匹配的日志条目。"
        
        output = []
        output.append(f"找到 {len(results)} 条日志记录:\n")
        
        for i, entry in enumerate(results, 1):
            output.append(f"{'='*60}")
            output.append(f"记录 {i}:")
            output.append(f"文件: {entry.get('file', 'unknown')}")
            
            if 'timestamp' in entry:
                output.append(f"时间: {entry['timestamp']}")
            
            if 'level' in entry:
                output.append(f"级别: {entry['level']}")
            
            if 'request_id' in entry:
                output.append(f"请求ID: {entry['request_id']}")
            
            if 'method' in entry:
                output.append(f"方法: {entry['method']}")
            
            if 'endpoint' in entry:
                output.append(f"端点: {entry['endpoint']}")
            
            if 'status_code' in entry:
                output.append(f"状态码: {entry['status_code']}")
            
            if 'username' in entry:
                output.append(f"用户: {entry['username']}")
            
            if 'user_id' in entry:
                output.append(f"用户ID: {entry['user_id']}")
            
            if 'response_time' in entry:
                output.append(f"响应时间: {entry['response_time']}ms")
            
            output.append(f"消息: {entry.get('message', '')}")
            
            if verbose and 'exception' in entry:
                output.append(f"异常信息:\n{entry['exception']}")
            
            output.append("")
        
        return "\n".join(output)


def main():
    parser = argparse.ArgumentParser(description="搜索和分析API错误日志")
    parser.add_argument("--log-dir", default="logs", help="日志文件目录")
    parser.add_argument("--log-file", help="指定日志文件名")
    parser.add_argument("--request-id", help="根据请求ID搜索")
    parser.add_argument("--user", help="根据用户名搜索")
    parser.add_argument("--endpoint", help="根据API端点搜索")
    parser.add_argument("--date", help="根据日期搜索 (YYYY-MM-DD)")
    parser.add_argument("--status", type=int, help="根据HTTP状态码搜索")
    parser.add_argument("--error", action="store_true", help="只显示错误日志")
    parser.add_argument("--limit", type=int, default=100, help="限制结果数量")
    parser.add_argument("--verbose", "-v", action="store_true", help="显示详细信息")
    
    args = parser.parse_args()
    
    searcher = LogSearcher(args.log_dir)
    
    results = searcher.search_logs(
        log_file=args.log_file,
        request_id=args.request_id,
        user=args.user,
        endpoint=args.endpoint,
        date=args.date,
        status_code=args.status,
        error_only=args.error,
        limit=args.limit
    )
    
    print(searcher.format_output(results, args.verbose))


if __name__ == "__main__":
    main()
