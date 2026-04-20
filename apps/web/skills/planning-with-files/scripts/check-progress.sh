#!/bin/bash

# Planning with Files - 进度检查脚本
# 用法: ./check-progress.sh

set -e

PLANNING_DIR=".planning"

if [ ! -d "$PLANNING_DIR" ]; then
    echo "❌ 未找到规划目录 (.planning)"
    echo "请先运行 ./init-session.sh 或使用 /planning-with-files"
    exit 1
fi

echo "📊 进度检查报告"
echo "=============="
echo ""

# 检查文件状态
echo "📁 文件状态:"
for file in task_plan.md findings.md progress.md; do
    if [ -f "$PLANNING_DIR/$file" ]; then
        last_update=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$PLANNING_DIR/$file" 2>/dev/null || stat -c "%y" "$PLANNING_DIR/$file" 2>/dev/null)
        echo "   ✅ $file (最后更新: $last_update)"
    else
        echo "   ❌ $file (缺失)"
    fi
done
echo ""

# 统计任务完成情况
echo "📈 任务完成情况:"
if [ -f "$PLANNING_DIR/task_plan.md" ]; then
    total=$(grep -c "^\s*-\s\[\]" "$PLANNING_DIR/task_plan.md" 2>/dev/null || echo "0")
    done=$(grep -c "^\s*-\s\[x\]" "$PLANNING_DIR/task_plan.md" 2>/dev/null || echo "0")
    
    if [ "$total" -gt 0 ]; then
        percent=$((done * 100 / total))
        echo "   完成: $done / $total ($percent%)"
        
        # 显示进度条
        bar_length=20
        filled=$((done * bar_length / total))
        empty=$((bar_length - filled))
        
        printf "   进度: ["
        printf "%0.s#" $(seq 1 $filled)
        printf "%0.s " $(seq 1 $empty)
        printf "] %d%%\n" $percent
    else
        echo "   尚未定义任务"
    fi
fi
echo ""

# 显示当前阶段
echo "🎯 当前阶段:"
if [ -f "$PLANNING_DIR/progress.md" ]; then
    phase=$(grep -A2 "当前状态" "$PLANNING_DIR/progress.md" | grep "当前阶段:" | sed 's/.*当前阶段: //')
    if [ -n "$phase" ]; then
        echo "   $phase"
    else
        echo "   Phase 1 - 初始化"
    fi
fi
echo ""

# 显示下一步
echo "📋 下一步行动:"
if [ -f "$PLANNING_DIR/progress.md" ]; then
    next=$(grep -A5 "立即执行" "$PLANNING_DIR/progress.md" | grep "-\s\[\]" | head -3)
    if [ -n "$next" ]; then
        echo "$next" | while read line; do
            echo "   $line"
        done
    else
        echo "   无待办事项"
    fi
fi
echo ""

# 显示错误记录
echo "⚠️  错误记录:"
if [ -f "$PLANNING_DIR/progress.md" ]; then
    errors=$(grep -c "### 错误 #" "$PLANNING_DIR/progress.md" 2>/dev/null || echo "0")
    if [ "$errors" -gt 0 ]; then
        echo "   发现 $errors 个已记录错误"
        grep -A3 "### 错误 #" "$PLANNING_DIR/progress.md" | head -12
    else
        echo "   无错误记录"
    fi
fi
echo ""

echo "=============="
echo "💡 提示: 使用 /planning-with-files:update 更新状态"
